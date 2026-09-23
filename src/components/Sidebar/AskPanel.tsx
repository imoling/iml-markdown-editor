import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Marked } from 'marked';
import { ArrowUp, Square, Eraser, FileText, Copy, Check, MessageCircleQuestion, Quote, MousePointerClick, ShieldCheck } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { useAskStore, type AskTurn } from '../../stores/askStore';
import { useSemanticState, semanticReady } from './RelatedPanel';
import { useAiReadiness } from '../../utils/aiReadiness';
import { sanitizeHtml } from '../../utils/sanitize';
import { linkCitations, citedNumbers, locateFragment, isRefusal, stripCitations } from '../../utils/askNotes';
import type { AskSource } from '../../types/window';
import { PanelIntro } from './PanelIntro';
import { AI_DISABLED } from '../../utils/uiText';

const answerMarkdown = new Marked({ gfm: true, breaks: true });

const INTRO_POINTS = [
  { icon: <Quote size={13} />, text: '每个结论都标着出处' },
  { icon: <MousePointerClick size={13} />, text: '点一下出处，跳到原文那一段' },
  { icon: <ShieldCheck size={13} />, text: '笔记里没写的，它会直说没有' },
];
const EXAMPLES = ['上次周会定了哪些待办？', '我记过哪些关于向量数据库的内容？', '这个月读的书里，哪些观点值得再看？'];

/** 答案：渲染 Markdown，把 [1] 变成可点的引用 */
const Answer: React.FC<{ turn: AskTurn; refused: boolean; onCite: (n: number) => void }> = ({ turn, refused, onCite }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 模型说「笔记里没有」时，它顺手挂上的 [1][2] 没有意义，去掉
    el.innerHTML = sanitizeHtml(answerMarkdown.parse(refused ? stripCitations(turn.answer) : turn.answer) as string);
    if (!refused) linkCitations(el, turn.sources.length);
  }, [turn.answer, turn.sources.length, refused]);
  return (
    <div
      ref={ref}
      className="ask-answer"
      onClick={(e) => { const n = Number((e.target as HTMLElement).closest<HTMLElement>('.ask-cite')?.dataset.cite); if (n) onCite(n); }}
    />
  );
};

const Turn: React.FC<{ turn: AskTurn; onOpen: (s: AskSource) => void; relative: (p: string) => string }> = ({ turn, onOpen, relative }) => {
  const [copied, setCopied] = useState(false);
  const [flash, setFlash] = useState<number | null>(null);
  const cited = useMemo(() => citedNumbers(turn.answer, turn.sources.length), [turn.answer, turn.sources.length]);
  const finished = turn.status === 'done' || turn.status === 'stopped';
  const refused = isRefusal(turn.answer);
  // 答完了、不是拒答、却一处出处都没标：小模型可能是拿常识答的，提醒用户对照依据核对
  const uncited = turn.status === 'done' && !!turn.answer && !refused && turn.sources.length > 0 && cited.length === 0;

  const cite = (n: number) => {
    setFlash(n);
    setTimeout(() => setFlash((f) => (f === n ? null : f)), 1200);
    const source = turn.sources[n - 1];
    if (source) onOpen(source);
  };

  return (
    <div className="ask-turn">
      <div className="ask-question">{turn.question}</div>

      {turn.status === 'retrieving' && <div className="ask-status"><span className="ask-dots" /> 正在笔记库里找相关内容…</div>}

      {/* 模型判断「笔记里没有」时，检索到的那几块就是不相关的，不摆出来添乱 */}
      {turn.sources.length > 0 && !refused && (
        <div className="ask-sources">
          <div className="ask-sources__title">依据 · {turn.sources.length} 处</div>
          {turn.sources.map((s, i) => (
            <div
              key={`${s.path}-${i}`}
              // 答完之后，没被引用到的来源淡下去：一眼看出答案到底靠的是哪几块
              className={`ask-source ${finished && cited.length > 0 && !cited.includes(i + 1) ? 'ask-source--unused' : ''} ${flash === i + 1 ? 'ask-source--flash' : ''}`}
              onClick={() => onOpen(s)}
              title={relative(s.path)}
            >
              <span className="ask-source__num">{i + 1}</span>
              <div className="ask-source__body">
                <div className="ask-source__title"><FileText size={11} /> <span className="truncate">{s.heading}</span></div>
                <div className="ask-source__text">{s.text.replace(/\s+/g, ' ').slice(0, 72)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {turn.status === 'done' && turn.sources.length === 0 && (
        <div className="ask-answer ask-answer--empty">笔记库里没有找到相关内容，换个说法或问得具体些</div>
      )}

      {turn.status === 'answering' && !turn.answer && <div className="ask-status"><span className="ask-dots" /> 正在根据这几处内容组织回答…</div>}
      {turn.answer && <Answer turn={turn} refused={refused} onCite={cite} />}
      {uncited && <div className="ask-status ask-status--warn">这段回答没有标出处，请对照上面的依据核对</div>}
      {turn.status === 'stopped' && <div className="ask-status">已停止</div>}
      {turn.status === 'error' && <div className="ask-status ask-status--error">{turn.error}</div>}

      {finished && turn.answer && (
        <div className="ask-turn__tools">
          <button className="btn-link" onClick={() => { void navigator.clipboard.writeText(turn.answer); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? <><Check size={11} /> 已复制</> : <><Copy size={11} /> 复制回答</>}
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * 问你的笔记（⌘J）：先在向量索引里找出最相关的几块原文，再让模型只根据这几块回答，并标出每个结论的出处。
 * 来源先于答案出现 —— 本机小模型要想几秒，先让人看到「找到了什么」。
 */
export const AskPanel: React.FC = () => {
  const aiEnabled = useAppStore((s) => s.aiEnabled);
  const workspacePath = useAppStore((s) => s.workspacePath);
  const openDialog = useAppStore((s) => s.openDialog);
  const openFileByPath = useAppStore((s) => s.openFileByPath);
  const showFindWith = useAppStore((s) => s.showFindWith);
  const { turns, ask, stop, clear, focusToken } = useAskStore();
  const semantic = useSemanticState();
  const readiness = useAiReadiness(aiEnabled);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const indexReady = semanticReady(semantic);
  const busy = turns.some((t) => t.status === 'retrieving' || t.status === 'answering');
  const lastAnswer = turns[turns.length - 1]?.answer;

  // 新内容出来就滚到底
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [turns.length, lastAnswer]);

  const relative = (p: string) => (workspacePath && p.startsWith(workspacePath) ? p.slice(workspacePath.length + 1) : p);

  const openSource = async (s: AskSource) => {
    await openFileByPath(s.path);
    // 交给文档内查找去定位并高亮；片段里挑不出合适的字就只打开
    const fragment = locateFragment(s.text);
    if (fragment) showFindWith(fragment);
  };

  const submit = () => {
    if (!input.trim() || busy) return;
    void ask(input);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';   // 上一条问题撑开的高度收回去
  };

  // ── 还用不了的几种情况：各自说清楚差什么、去哪配 ──
  const loading = semantic === null;
  const blocker = loading ? null : !aiEnabled
    ? { text: AI_DISABLED, action: '去打开', go: () => openDialog('settings') }
    : !readiness.ready
      ? { text: `${readiness.message}。回答问题要靠一个对话模型。`, action: '一分钟配好', go: () => openDialog('ai-setup') }
      : !indexReady
        ? { text: '先开启「相关笔记」，问答要靠它找到相关内容', action: '去开启', go: () => openDialog('semantic-config') }
        : null;

  const canAsk = !loading && !blocker;

  // 状态读回来之前输入框还没渲染，所以「能问了」的那一刻也要抢一次焦点
  useEffect(() => { inputRef.current?.focus(); }, [focusToken, canAsk]);

  return (
    <div className="ask-panel">
      <div className="ask-panel__head">
        <span className="sidebar-section-title">问你的笔记</span>
        {turns.length > 0 && <button className="btn-link" onClick={clear} title="清空对话"><Eraser size={12} /> 清空</button>}
      </div>

      <div className="ask-panel__list" ref={listRef}>
        {loading ? null : blocker ? (
          <div className="tree-empty tree-empty--root">
            {blocker.text}
            <button className="btn-link" onClick={blocker.go}>{blocker.action}</button>
          </div>
        ) : turns.length === 0 ? (
          <PanelIntro icon={<MessageCircleQuestion size={20} />} title="答案只来自你的笔记" lead="用大白话问就行，不用想关键词。" points={INTRO_POINTS}>
            <div className="ask-examples">
              <div className="ask-examples__title">试着问</div>
              {EXAMPLES.map((q) => (
                // 填进输入框而不是直接发出去：例子多半要改两个字才对得上自己的笔记
                <button key={q} className="ask-example" onClick={() => { setInput(q); inputRef.current?.focus(); }}>{q}</button>
              ))}
            </div>
          </PanelIntro>
        ) : (
          turns.map((t) => <Turn key={t.id} turn={t} onOpen={openSource} relative={relative} />)
        )}
      </div>

      {canAsk && semantic?.indexing && (
        <div className="ask-panel__note">索引还在建立（{semantic.indexed} / {semantic.total}），没读完的笔记暂时问不到。</div>
      )}

      {canAsk && (
        <div className="ask-panel__input-wrap">
          <textarea
            ref={inputRef}
            className="ask-panel__input"
            rows={1}
            value={input}
            placeholder="问点什么…"
            onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`; }}
            onKeyDown={(e) => {
              // 输入法组字时的回车是确认候选词，不是发送
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
          />
          {busy
            ? <button className="ask-panel__send ask-panel__send--stop" onClick={stop} title="停止"><Square size={11} /></button>
            : <button className="ask-panel__send" onClick={submit} disabled={!input.trim()} title="发送（回车）"><ArrowUp size={14} /></button>}
        </div>
      )}
    </div>
  );
};
