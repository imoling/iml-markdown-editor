import { useCallback, useMemo, useRef } from 'react';
import { useAppStore, SkillRun, SkillStepRun, CoverImage } from '../stores/appStore';
import { useAI, Message } from './useAI';
import {
  Skill,
  SkillStep,
  getSkillById,
  getStepById,
  renderTemplate,
  buildPolishSystemPrompt,
} from '../data/skills';

/** 解析大纲文本：按行拆分、去序号、去空行 */
function parseOutline(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => l.replace(/^\d+[.\、)]\s*/, ''));
}

/** 从前置 step 找 outlineItems（若该 step 是 singleSelect 且已选中，则只返回选中项） */
function getUpstreamOutline(
  run: SkillRun,
  skill: Skill | undefined,
  fromStepId?: string,
): string[] | undefined {
  if (!fromStepId) return undefined;
  const stepRun = run.steps.find((s) => s.stepId === fromStepId);
  if (!stepRun?.outlineItems) return undefined;

  // 判断该 step 是否为 singleSelect
  const stepDef = skill?.steps.find((s) => s.id === fromStepId);
  if (stepDef?.singleSelect && stepRun.selectedItemIndex !== undefined) {
    const selected = stepRun.outlineItems[stepRun.selectedItemIndex];
    return selected !== undefined ? [selected] : stepRun.outlineItems;
  }
  return stepRun.outlineItems;
}

function getUpstreamOutput(run: SkillRun, fromStepId?: string): string | undefined {
  if (!fromStepId) return undefined;
  const step = run.steps.find((s) => s.stepId === fromStepId);
  if (!step) return undefined;
  if (step.sectionOutputs && Object.keys(step.sectionOutputs).length > 0) {
    // 按 outlineItems 顺序拼接
    const outline =
      step.outlineItems ||
      getUpstreamOutline(run, undefined, run.steps.find((s) => s.stepId === fromStepId)?.stepId);
    if (outline) {
      return outline.map((_, i) => step.sectionOutputs![String(i)] || '').join('\n\n');
    }
    return Object.values(step.sectionOutputs).join('\n\n');
  }
  return step.output;
}

/** 创建一个全新的 SkillRun（仅生成对象，不写 store） */
export function createSkillRun(skill: Skill, vibe: string, webContext?: string): SkillRun {
  const now = Date.now();
  return {
    id: `run-${now}-${Math.random().toString(36).slice(2, 8)}`,
    skillId: skill.id,
    vibe,
    webContext,
    currentStepIndex: 0,
    createdAt: now,
    updatedAt: now,
    steps: skill.steps.map<SkillStepRun>((s) => ({
      stepId: s.id,
      status: 'pending',
      output: '',
      updatedAt: now,
    })),
  };
}

export function useSkillRunner(runId: string | null) {
  const run = useAppStore((s) => (runId ? s.skillRuns[runId] : undefined));
  const updateSkillStepRun = useAppStore((s) => s.updateSkillStepRun);
  const upsertSkillRun = useAppStore((s) => s.upsertSkillRun);
  const openTab = useAppStore((s) => s.openTab);
  const updateTabContent = useAppStore((s) => s.updateTabContent);
  const { generate, stop } = useAI();
  const imageGenConfig = useAppStore((s) => s.imageGenConfig);
  const activeRequestIdRef = useRef<string | null>(null);

  const skill = useMemo<Skill | undefined>(
    () => (run ? getSkillById(run.skillId) : undefined),
    [run?.skillId],
  );

  /** 渲染单个 step 的 user prompt */
  const buildPromptVars = useCallback(
    (step: SkillStep, sectionIndex?: number): Record<string, string | number | undefined> => {
      if (!run) return {};
      const outlineItems =
        getUpstreamOutline(run, skill, step.outlineFromStepId) ||
        run.steps.find((s) => s.stepId === 'outline')?.outlineItems;
      const outlineText = outlineItems
        ? outlineItems.map((it, i) => `${i + 1}. ${it}`).join('\n')
        : '';
      const prevOutput =
        getUpstreamOutput(run, step.polishFromStepId || 'draft') ||
        (step.polishFromStepId ? getUpstreamOutput(run, 'draft') : undefined);
      // contextFromStepId → {{context}}（第二路上游，取 singleSelect 选中项或完整输出）
      const contextItems = getUpstreamOutline(run, skill, step.contextFromStepId);
      const context = contextItems ? contextItems.join('\n') : undefined;
      const COLOR_HEX: Record<string, string> = {
        blue: '#3d7de0', green: '#10b981', purple: '#8b5cf6',
        red: '#ef4444', orange: '#f97316', black: '#1a1a1a',
      };
      const currentStepRun = run.steps.find((s) => s.stepId === step.id);
      const themeColor = COLOR_HEX[currentStepRun?.publishColor ?? 'blue'] ?? '#3d7de0';
      const vars: Record<string, string | number | undefined> = {
        vibe: run.vibe,
        webContext: run.webContext,
        outline: outlineText,
        prevOutput,
        context,
        themeColor,
      };
      if (sectionIndex !== undefined && outlineItems) {
        vars.section = outlineItems[sectionIndex];
        vars.sectionIndex = sectionIndex + 1;
      }
      return vars;
    },
    [run],
  );

  /** 执行单个 step（section 类需提供 sectionIndex 来跑单项；缺省则跑全部） */
  const executeStep = useCallback(
    async (stepId: string, opts?: { sectionIndex?: number }) => {
      if (!run || !skill) return;
      const step = getStepById(skill, stepId);
      if (!step) return;

      // publish 类：无需 AI，仅标记完成（实际发布由 UI 按钮触发）
      if (step.kind === 'publish') {
        updateSkillStepRun(run.id, stepId, { status: 'done' });
        return;
      }

      // cover 类：调用图片抓取/生成 IPC
      if (step.kind === 'cover') {
        updateSkillStepRun(run.id, stepId, { status: 'running', coverImages: undefined, error: undefined });
        try {
          // 从 article_outline 提取正式标题
          const outlineItems = getUpstreamOutline(run, skill, step.outlineFromStepId);
          let title = run.vibe;
          if (outlineItems) {
            const titleItem = outlineItems.find((it) => it.includes('正式标题'));
            if (titleItem) {
              title = titleItem.replace(/^\d+\.\s*正式标题[：:]\s*/, '').trim() || run.vibe;
            }
          }
          const coverImages: CoverImage[] = await (window as any).api.ai.getCoverImages({
            query: title,
            vibe: run.vibe,
            config: imageGenConfig,
          });
          updateSkillStepRun(run.id, stepId, {
            status: coverImages.length > 0 ? 'done' : 'error',
            coverImages,
            selectedCoverIndex: coverImages.length > 0 ? 0 : undefined,
            error: coverImages.length === 0 ? '未能获取封面图片，请重试' : undefined,
          });
        } catch (err: any) {
          updateSkillStepRun(run.id, stepId, { status: 'error', error: err.message || '封面图获取失败' });
        }
        return;
      }

      // section 类：若未指定 sectionIndex，则循环全部
      if (step.kind === 'section' && opts?.sectionIndex === undefined) {
        const outline =
          getUpstreamOutline(run, skill, step.outlineFromStepId) ||
          run.steps.find((s) => s.stepId === 'outline')?.outlineItems ||
          [];
        if (outline.length === 0) {
          updateSkillStepRun(run.id, stepId, {
            status: 'error',
            error: '缺少大纲，无法逐项生成',
          });
          return;
        }
        updateSkillStepRun(run.id, stepId, {
          status: 'running',
          sectionOutputs: {},
          outlineItems: outline,
        });
        for (let i = 0; i < outline.length; i++) {
          await executeStep(stepId, { sectionIndex: i });
        }
        // 检查是否全部完成
        const latest = useAppStore.getState().skillRuns[run.id];
        const cur = latest?.steps.find((s) => s.stepId === stepId);
        const allDone =
          cur?.sectionOutputs && Object.keys(cur.sectionOutputs).length === outline.length;
        updateSkillStepRun(run.id, stepId, {
          status: allDone ? 'done' : 'error',
        });
        return;
      }

      const vars = buildPromptVars(step, opts?.sectionIndex);
      const userPrompt = renderTemplate(step.userPromptTemplate, vars);

      // polish 步骤：根据用户勾选的功能项动态组合 system prompt
      const stepRunState = run.steps.find((s) => s.stepId === stepId);
      const effectiveSystemPrompt =
        step.kind === 'polish'
          ? buildPolishSystemPrompt(step.systemPrompt, stepRunState?.polishOptions ?? [])
          : step.systemPrompt;

      const messages: Message[] = [
        { role: 'system', content: effectiveSystemPrompt },
        { role: 'user', content: userPrompt },
      ];

      // 单 section 项：不重置整个 step 状态，只写 sectionOutputs
      const isSingleSection = step.kind === 'section' && opts?.sectionIndex !== undefined;
      const isWritingStep = step.kind === 'draft' || step.kind === 'polish' || step.kind === 'section';

      if (!isSingleSection) {
        updateSkillStepRun(run.id, stepId, {
          status: 'running',
          output: '',
          error: undefined,
        });
      }

      // 写作类步骤：确保有 tab；重跑时先清空 tab 内容
      if (isWritingStep && !isSingleSection) {
        const currentRun = useAppStore.getState().skillRuns[run.id];
        if (!currentRun?.tabId) {
          const tabId = `ai-gen-${Date.now()}.md`;
          openTab({ id: tabId, title: skill.label, content: '', isDirty: true, mode: 'word' });
          upsertSkillRun({ ...currentRun!, tabId });
        } else {
          // 重跑：先清空，避免旧内容残留
          updateTabContent(currentRun.tabId, '');
        }
      }

      /** 从最新 store 状态装配 markdown，用于实时写入 tab */
      const assembleFromLatest = (latestAccumulated: string): string => {
        const latestRun = useAppStore.getState().skillRuns[run.id];
        if (!latestRun || !skill) return latestAccumulated;

        // polish 直接替换
        if (step.kind === 'polish') return latestAccumulated.trim();

        const parts: string[] = [];
        for (const s of skill.steps) {
          const sr = latestRun.steps.find((r) => r.stepId === s.id);
          if (!sr) continue;
          if (s.kind === 'outline' || s.kind === 'brainstorm' || s.kind === 'polish' || s.kind === 'cover' || s.kind === 'custom' || s.kind === 'publish') continue;
          const isDone = sr.status === 'done';
          const isCurrent = s.id === stepId;
          if (s.kind === 'section') {
            const outline = getUpstreamOutline(latestRun, skill, s.outlineFromStepId) || sr.outlineItems || [];
            for (let i = 0; i < outline.length; i++) {
              const piece = isCurrent && opts?.sectionIndex === i
                ? latestAccumulated
                : (sr.sectionOutputs?.[String(i)] || '');
              if (piece) parts.push(piece.trim());
            }
          } else if (isDone && sr.output) {
            parts.push(sr.output.trim());
          } else if (isCurrent && latestAccumulated) {
            parts.push(latestAccumulated.trim());
          }
        }
        return parts.join('\n\n');
      };

      const rid = `${run.id}-${stepId}-${opts?.sectionIndex ?? ''}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      activeRequestIdRef.current = rid;
      let accumulated = '';
      // 节流写 store
      let lastFlush = 0;
      const flush = (force = false) => {
        const now = Date.now();
        if (!force && now - lastFlush < 80) return;
        lastFlush = now;
        if (isSingleSection) {
          const latest = useAppStore.getState().skillRuns[run.id];
          const cur = latest?.steps.find((s) => s.stepId === stepId);
          const sectionOutputs = { ...(cur?.sectionOutputs || {}) };
          sectionOutputs[String(opts!.sectionIndex)] = accumulated;
          updateSkillStepRun(run.id, stepId, { sectionOutputs });
        } else {
          updateSkillStepRun(run.id, stepId, { output: accumulated });
        }
        // 实时同步到 tab
        if (isWritingStep) {
          const latestRun = useAppStore.getState().skillRuns[run.id];
          const tabId = latestRun?.tabId;
          if (tabId) {
            updateTabContent(tabId, assembleFromLatest(accumulated));
          }
        }
      };

      try {
        const maxTokens = step.id === 'wechat_html' ? 16000 : undefined;
        await generate(
          messages,
          (chunk) => {
            accumulated += chunk;
            flush();
          },
          rid,
          maxTokens,
        );
        flush(true);

        // 全局：去掉推理模型的 <think>...</think> 块
        accumulated = accumulated.replace(/<think>[\s\S]*?<\/think>/gi, '').trimStart();

        // 后处理
        if (step.kind === 'outline') {
          const outlineItems = parseOutline(accumulated);
          updateSkillStepRun(run.id, stepId, {
            status: outlineItems.length > 0 ? 'done' : 'error',
            output: accumulated,
            outlineItems,
            error: outlineItems.length === 0 ? '解析大纲失败' : undefined,
          });
        } else if (isSingleSection) {
          // 单 section 项完成 → 不动整体 step.status
          // status 由外层循环负责
        } else {
          // 裁掉模型输出的前言文字
          const finalOutput = step.id === 'wechat_html'
            ? (() => {
                // 去掉 markdown 代码块包裹 ```html ... ```
                const mdMatch = accumulated.match(/```(?:html)?\s*([\s\S]*?)```/i);
                if (mdMatch) return mdMatch[1].trim();
                // 找第一个真正的 HTML 根标签起点
                const idx = accumulated.search(/<!DOCTYPE|<html|<section|<div|<body/i);
                return idx > 0 ? accumulated.slice(idx) : accumulated.trim();
              })()
            : step.kind === 'draft'
            ? (() => {
                // 裁掉正文前的任务描述/前言，从第一个 Markdown 标题开始
                const idx = accumulated.search(/^#{1,6}\s/m);
                return idx > 0 ? accumulated.slice(idx) : accumulated.trim();
              })()
            : accumulated;
          updateSkillStepRun(run.id, stepId, { status: 'done', output: finalOutput });
        }
      } catch (err: any) {
        if (err.message === 'REQUEST_ABORTED') {
          updateSkillStepRun(run.id, stepId, { status: 'pending' });
        } else {
          updateSkillStepRun(run.id, stepId, {
            status: 'error',
            error: err.message || '生成失败',
          });
        }
      } finally {
        if (activeRequestIdRef.current === rid) activeRequestIdRef.current = null;
      }
    },
    [run, skill, buildPromptVars, generate, updateSkillStepRun],
  );

  const stopCurrent = useCallback(() => {
    if (activeRequestIdRef.current) {
      stop(activeRequestIdRef.current);
      activeRequestIdRef.current = null;
    }
  }, [stop]);

  const skipStep = useCallback(
    (stepId: string) => {
      if (!run) return;
      updateSkillStepRun(run.id, stepId, { status: 'skipped' });
    },
    [run, updateSkillStepRun],
  );

  const selectCover = useCallback(
    (stepId: string, index: number) => {
      if (!run) return;
      updateSkillStepRun(run.id, stepId, { selectedCoverIndex: index, status: 'done' });
    },
    [run, updateSkillStepRun],
  );

  const editStepOutput = useCallback(
    (stepId: string, patch: Partial<SkillStepRun>) => {
      if (!run) return;
      updateSkillStepRun(run.id, stepId, patch);
    },
    [run, updateSkillStepRun],
  );

  /** 把所有 done 步骤的产物装配为最终 markdown
   *  规则：若存在已完成的 polish 步骤，直接返回其输出（替换草稿，不拼接）*/
  const assembleMarkdown = useCallback((): string => {
    if (!run || !skill) return '';

    // 优先取最后一个完成的 polish 步骤输出
    const donePolish = [...skill.steps]
      .reverse()
      .find((s) => s.kind === 'polish' && run.steps.find((r) => r.stepId === s.id)?.status === 'done');
    if (donePolish) {
      const polishRun = run.steps.find((r) => r.stepId === donePolish.id);
      if (polishRun?.output) return polishRun.output.trim();
    }

    const parts: string[] = [];
    for (const step of skill.steps) {
      const sr = run.steps.find((s) => s.stepId === step.id);
      if (!sr || sr.status !== 'done') continue;
      // outline / brainstorm / polish / cover / custom 不参与拼接
      if (step.kind === 'outline' || step.kind === 'brainstorm' || step.kind === 'polish' || step.kind === 'cover' || step.kind === 'custom') continue;
      if (step.kind === 'section' && sr.sectionOutputs) {
        const outline =
          getUpstreamOutline(run, skill, step.outlineFromStepId) || sr.outlineItems || [];
        for (let i = 0; i < outline.length; i++) {
          const piece = sr.sectionOutputs[String(i)];
          if (piece) parts.push(piece.trim());
        }
      } else if (sr.output) {
        parts.push(sr.output.trim());
      }
    }
    return parts.join('\n\n');
  }, [run, skill]);

  /** 装配并写入新 tab；若已有 tabId 则复用 */
  const writeToDocument = useCallback(() => {
    if (!run || !skill) return;
    const md = assembleMarkdown();
    if (!md) return;
    const tabId = run.tabId || `ai-gen-${Date.now()}.md`;
    if (!run.tabId) {
      openTab({
        id: tabId,
        title: skill.label,
        content: md,
        isDirty: true,
        mode: 'word',
      });
      upsertSkillRun({ ...run, tabId });
    } else {
      updateTabContent(tabId, md);
    }
  }, [run, skill, assembleMarkdown, openTab, updateTabContent, upsertSkillRun]);

  return {
    run,
    skill,
    executeStep,
    skipStep,
    selectCover,
    editStepOutput,
    stopCurrent,
    assembleMarkdown,
    writeToDocument,
  };
}
