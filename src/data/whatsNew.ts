import { majorMinor } from '../utils/version';

/** 配图键：对应 src/assets/whats-new/<key>.png，在 WhatsNewModal 里映射 */
export type WhatsNewImage =
  | 'hero' | 'slash' | 'wiki' | 'search' | 'daily' | 'local'
  | 'v262-hero' | 'v262-source' | 'v262-compat' | 'v262-paste' | 'v262-history' | 'v262-semantic' | 'v262-focus'
  | 'v263-hero' | 'v263-ask' | 'v263-transcribe' | 'v263-playback' | 'v263-config' | 'v263-update'
  | 'v264-hero' | 'v264-palette' | 'v264-tasks' | 'v264-daily' | 'v264-export' | 'v264-transcribe' | 'v264-asrconfig'
  | 'v265-image' | 'v265-hero' | 'v265-resources' | 'v265-fold' | 'v265-syscap' | 'v265-wechat' | 'v265-daily';

export interface WhatsNewPage {
  key: string;
  /** 标题上方的小字，如「记笔记」 */
  kicker: string;
  title: string;
  desc: string;
  /** 快捷键或触发方式 */
  hint?: string;
  bullets?: string[];
  image: WhatsNewImage;
}

export interface WhatsNewEntry {
  /** 展示用版本号（年份.小版本），与 formatVersion(app 版本) 对齐 */
  version: string;
  title: string;
  pages: WhatsNewPage[];
  /** 这一版拿掉的东西，给老用户一个交代（显示在最后一页） */
  removed?: string;
  releaseUrl: string;
}

/** 每个大版本一条；新版本加在最前面 */
export const WHATS_NEW: WhatsNewEntry[] = [
  {
    version: '26.5',
    title: '想要的图，这台电脑自己画',
    releaseUrl: 'https://github.com/imoling/iml-markdown-editor/releases/tag/v26.5.0',
    pages: [
      {
        key: 'intro', kicker: '新特性', title: '想要的图，这台电脑自己画',
        desc: '写到一半想配张图，不用出门找素材，也不用把想法发给谁：说一句想要什么，这台电脑自己画出来，存在笔记旁边。全程离线，和对话、检索、转写一样，都在本机完成。',
        bullets: ['两个模型可选：Z-Image Turbo（八步出图，快）或 Qwen-Image 2.1（细）', '出图的几分钟里正文占着位，随时能取消', '几个本机模型按内存自己排队，不会一股脑全起来把机器压垮'],
        image: 'v265-image',
      },
      {
        key: 'progress', kicker: '本机生图', title: '等的这几分钟，看得见', hint: '空行按空格 → AI 配图',
        desc: '本机出图要几分钟。正文里先占一块位，上面写着提示词和进度——腾内存、读模型 N%、第几步、还要多久，画完原地换成真图。气泡关了也没关系，占位块一直在那儿，点它就能不要了。',
        bullets: ['占位块只是显示层：画到一半保存文件，落盘的还是原文', '这几分钟里你可以接着在别处写，图会插回原来的位置', '图片存在笔记旁的 assets 里，走的是相对路径'],
        image: 'v265-hero',
      },
      {
        key: 'resources', kicker: '本机智能', title: '几个模型，一台电脑，自己排队', hint: '智能 → 本机资源',
        desc: '对话、嵌入、转写、生图都要内存。现在它们按组管：对话和嵌入一起启停，转写用时自动起、用完自己退，生图出图时才起。内存不够才请人让位，让完的自己回来；对方正忙就等它干完，不会张口就说「内存不够」。',
        bullets: ['占多少按实测算，不靠文件大小猜；空闲多久自动停可以自己设', '面板上一眼看清：本机模型 + 其它程序 + 可用 = 这台电脑的内存', '正在干活的模型不会被停掉'],
        image: 'v265-resources',
      },
      {
        key: 'fold', kicker: '写作', title: '长文收起来看', hint: '⌥⌘[ / ⌥⌘]',
        desc: '标题左边的箭头收起整节，列表项有子项时也能收。收起来的部分只是不显示，文件一个字都没动；光标移进去会自动展开。',
        bullets: ['⌥⌘[ 折叠当前小节，⌥⌘] 展开', '大纲式的笔记可以只留标题，想看哪节点哪节'],
        image: 'v265-fold',
      },
      {
        key: 'syscap', kicker: '实时转写', title: '电脑放出来的声音也能转', hint: '转写 → 收音设备 → 系统声音',
        desc: '网课、线上会议里对方说的话，以前戴上耳机就收不到了。现在可以直接收电脑放出来的声音（macOS），识别照样在本机完成，声音不上传。',
        bullets: ['第一次用系统会请求「屏幕录制」权限', '和麦克风一样：一场转写 = 一篇笔记，点句子回听', 'Windows 的系统声音还在计划中'],
        image: 'v265-syscap',
      },
      {
        key: 'wechat', kicker: '分享', title: '复制为公众号格式', hint: '⌘⇧P → 公众号',
        desc: '选个主题，看着手机预览调，一键复制，粘到公众号编辑器里就是排好的版：代码块、表格、公式、图片都带着样式过去。',
        bullets: ['几套主题可选，标题、引用、代码块各有各的样子', '图片按公众号的宽度缩好，不用再一张张调'],
        image: 'v265-wechat',
      },
      {
        key: 'daily', kicker: '日记', title: '这个月写了多少，一眼看见',
        desc: '侧边栏的月历按这一天写了多少字填深浅，像 GitHub 那种格子；点一下打开，没有的日子问一句再新建。新建时跟着你已有的目录习惯走——平铺、按年、按年月都认。',
        bullets: ['日记/2026/09/2026-09-23.md 这种分法，新建的也会放进去', '本月写了几篇写在月份旁边'],
        image: 'v265-daily',
      },
    ],
  },
  {
    version: '26.4',
    title: '本机智能，笔记不出门',
    releaseUrl: 'https://github.com/imoling/iml-markdown-editor/releases/tag/v26.4.0',
    pages: [
      {
        key: 'intro', kicker: '新特性', title: '本机智能，笔记不出门',
        desc: '开会时谁说的一眼看清，声纹在这台电脑上算、只存在这台电脑上；手机录的会议、课程音频选个文件就转成笔记，约 40 倍速，全程离线。和实时转写、整理纪要、问你的笔记一起：听、认、记、问，全都在本机完成。',
        bullets: ['区分说话人、转写录音文件、一场转写 = 一篇笔记', '编辑器这边搬来就能用：[[笔记#小节]]、![[嵌入]]、别名、悬浮预览、未链接提及', '日记月历、全库待办、标签改名、快速捕获、属性面板、命令面板、导出 Word / 长图'],
        image: 'v264-transcribe',
      },
      {
        key: 'speakers', kicker: '本机智能', title: '谁说的，一眼看清',
        desc: '每句话定稿时在本机算一个声纹，够像就归给已有的人，不像就是新来的「说话人 N」；面板上一人一个颜色。点名字改名，改成已有的名字就是合并；「这是我」记住你的声纹，以后每场自动标成「我」。',
        bullets: ['声纹模型 27 MB，可选下载；声纹只在这台电脑上算、只存在这台电脑上', '转写一段录音：手机录的会议、课程音频选一个文件就转，点句子回听、整理纪要都能用', '一场转写 = 一篇笔记：点开始就新建一篇会议记录，停下来全文和录音自动写进去；⌘⇧L 在正文打一个可点的时间戳'],
        image: 'v264-asrconfig',
      },
      {
        key: 'links', kicker: '搬来就能用', title: '链接织完了', hint: '[[',
        desc: '[[笔记#小节]]、[[#本篇小节]]、[[笔记#^块]] 都能跳到位，输入 [[笔记# 会列出小节供选；![[嵌入]] 把另一篇的一段就地渲染进来，笔记、小节、块、图片、音频、视频都行。',
        bullets: ['属性里的 aliases 参与链接解析、补全和快速打开', '鼠标停在链接上就能看到那篇的开头，不用点过去', '反链面板列出「未链接提及」：正文里提到了这篇的名字但没加链接的地方，点一下就地改成链接'],
        image: 'v264-hero',
      },
      {
        key: 'palette', kicker: '效率', title: '命令面板', hint: '⌘⇧P',
        desc: '所有菜单里的动作都能搜到：中文、拼音首字母（dc → 导出）、英文都行，还有「插入：表格 / 公式 / 提示块…」。⌘T 快速打开也认拼音首字母：敲 xmzh 就能找到「项目周会」。',
        bullets: ['你原来的 ⌘P 导出 PDF 没动', '⌥↑ / ⌥↓ 整块上下移动；脚注 [^1] 点一下跳到定义', '源码模式 ⌘D 选中下一个相同的词；可选的 Vim 键位'],
        image: 'v264-palette',
      },
      {
        key: 'tasks', kicker: '待办', title: '全库待办，打勾写回原文',
        desc: '侧边栏新页「待办」汇总所有笔记里的任务：认 📅 2026-09-30 和 [due:: 2026-09-30]，按 已过期 / 今天 / 明天 / 7 天 / 以后 分段，其余按笔记分组。打勾直接写回原笔记那一行。',
        bullets: ['点任务跳到笔记里那一行', '模板文件夹里的不算', '行号对不上（笔记被别处改过）时全篇找唯一匹配，找不到就不动'],
        image: 'v264-tasks',
      },
      {
        key: 'daily', kicker: '日记', title: '月历、属性面板、标签改名', hint: '⌃⌥N',
        desc: '笔记库页底部钉着一个月历，有日记的日子有标记，点没日记的日子按模板新建。属性卡片可以直接编辑：文本、日期、勾选、列表芯片，只动那个字段的几行，注释和引号风格都不变。',
        bullets: ['快速捕获：全局快捷键 ⌃⌥N 随时弹一个小窗口，敲完回车追加到今天的日记，焦点回到原来的软件', '标签面板右键就地改名，改成已有的名字就是合并；没改到的行一个字节都不动', '文件树可按修改 / 创建时间排序；同步盘一键指过去，反悔了再点一下改回'],
        image: 'v264-daily',
      },
      {
        key: 'export', kicker: '导出', title: '导出 Word 与长图',
        desc: '导出为 Word（.docx）：标题、列表、表格、代码、提示块、脚注、图片、嵌入都转成 Word 自己的结构，WPS / Pages 也能开。导出为长图：发群里、发朋友圈用，超长的自动分成几张，切在段落边界。',
        bullets: ['每张长图末尾带一个「来自 iML Markdown Editor」的角标', '导出成功的提示带「打开」「在访达中显示」，不用再翻文件夹', '导出 PDF / HTML 时 ![[嵌入]] 也会展开'],
        image: 'v264-export',
      },
    ],
  },
  {
    version: '26.3',
    title: '听得见，问得到',
    releaseUrl: 'https://github.com/imoling/iml-markdown-editor/releases/tag/v26.3.0',
    pages: [
      {
        key: 'intro', kicker: '新特性', title: '听得见，问得到',
        desc: '开会、听课时它替你记全文，你只管记要点；记下来的东西，之后用大白话一问就能找到。两件事都在这台电脑上完成，声音和笔记都不出门。',
        bullets: ['实时转写：边听边出字，点哪句话就从哪句开始回听', '一键整理纪要：结合你自己记的要点，列出结论和待办', '问你的笔记：答案只来自你的笔记，每个结论都标着出处'],
        image: 'v263-hero',
      },
      {
        key: 'transcribe', kicker: '实时转写', title: '你记要点，全文它来记',
        desc: '侧边栏「转写」页点一下开始：说话的同时文字就出来，停顿后定稿、自动加标点。中文、英语、粤语、日语、韩语都认得。转写时可以切去别的面板，状态栏的红点一直提醒你「正在听」。',
        bullets: ['识别在本机完成：首次使用下载约 240 MB 的语音模型，之后离线可用', '停了可以接着录，时间戳接着往下排', '没放进笔记就退出了也不怕，下次打开还在'],
        image: 'v263-transcribe',
      },
      {
        key: 'playback', kicker: '回听与纪要', title: '点哪句，听哪句',
        desc: '转写的同时留一份录音（一小时约 11 MB，可以关掉）。放进笔记后，全文折叠成一块、带着播放器跟笔记存在一起：点任意一句话，录音就跳到那句话开始的地方。',
        bullets: ['整理纪要：以你记的要点为线索，生成「议题与结论」和「待办」，放在转写全文前面', '转写块是标准的 HTML，Obsidian、GitHub 里同样是折叠的', '转写的内容「问你的笔记」照样问得到'],
        image: 'v263-playback',
      },
      {
        key: 'ask', kicker: '问你的笔记', title: '答案只来自你的笔记', hint: '⌘J',
        desc: '用大白话问就行，不用想关键词。它先在笔记库里找出最相关的几段原文，再只根据这几段回答，每个结论后面标着出处 —— 点一下，跳到原文那一段。',
        bullets: ['笔记里没写的，它会直说没有，不拿常识糊弄你', '可以接着追问：「那第二条是谁负责？」', '需要先开启「相关笔记」，并配好一个对话模型（本机模型免费、离线）'],
        image: 'v263-ask',
      },
      {
        key: 'config', kicker: '心里有数', title: '能不能用，一眼看清',
        desc: '智能 → 实时转写…：能不能用一眼看清；语音模型的下载与删除；录音留不留；用哪个麦克风，点「试一下」看它有没有在收音。',
        bullets: ['转写时一点声音都没进来，面板会提醒你检查麦克风', '选定的麦克风拔掉了，自动退回系统默认，插回来再用回它', '正在转写时退出应用，会先问一句'],
        image: 'v263-config',
      },
      {
        key: 'more', kicker: '还有这些', title: '更轻，更快，更省心',
        desc: '安装包小了一大截：Windows 从 250 MB 降到 79 MB，macOS 从 153 MB 降到 88 MB。启动要加载的代码少了三分之一。',
        bullets: ['发现新版本只主动提醒一次，写明更新了什么，并直接给出你这台电脑该下的安装包', '纪要和问答针对本机小模型重新调过：更守规矩，也更快', '「智能」菜单按功能命名：问你的笔记、写作助手、相关笔记、实时转写、AI 配图'],
        image: 'v263-update',
      },
    ],
  },
  {
    version: '26.2',
    title: '放心把笔记搬进来',
    releaseUrl: 'https://github.com/imoling/iml-markdown-editor/releases/tag/v26.2.0',
    pages: [
      {
        key: 'intro', kicker: '新特性', title: '放心把笔记搬进来',
        desc: '这一版只做一件事：让你敢把 Obsidian、Typora、GitHub 里的笔记直接搬过来用 —— 写法都认得，文件不会被改花，改错了能找回来。',
        bullets: ['没编辑过的内容，保存时一个字符都不动', '属性、提示块、#标签、[TOC]、脚注、行内公式都认得', '版本历史、图片压缩与清理、本机语义索引'],
        image: 'v262-hero',
      },
      {
        key: 'fidelity', kicker: '保真', title: '改一个字，只变一个字',
        desc: '富文本模式保存时，没碰过的段落直接写回文件里的原文：表格的对齐、列表用 * 还是 -、标题后空不空行、文件末尾的换行，全都保持原样。',
        bullets: ['my_var 不再变成 my\\_var，[1] 不再变成 \\[1\\]', '删除线、<kbd>、<details>、HTML 注释、脚注不再丢失', '放进 Git 验证：git diff 里只有你改的那一行'],
        image: 'v262-source',
      },
      {
        key: 'compat', kicker: '兼容', title: '属性、提示块、标签、目录', hint: '/',
        desc: '文档开头的 YAML 显示成属性卡片；> [!NOTE] 渲染成彩色提示块；#标签 自动汇总到侧边栏的标签视图；[TOC] 生成随标题更新的目录。',
        bullets: ['斜杠菜单新增：提示块、警告块、目录、属性', '行内公式 $E=mc^2$ 直接渲染，单击修改', '侧边栏「标签」页：层级标签、按标签筛笔记'],
        image: 'v262-compat',
      },
      {
        key: 'paste', kicker: '粘贴与图片', title: '截图不再是几 MB 的负担',
        desc: '粘贴或拖入的图片自动压缩成 WebP，存到笔记旁的 assets/ 并用时间戳命名；相对路径的图片现在能在编辑器里正常显示了。',
        bullets: ['粘贴网址自动取网页标题，变成 [标题](网址)', '源码模式粘贴网页内容，自动转成 Markdown', '视图 → 清理未引用的图片：移入废纸篓，可恢复'],
        image: 'v262-paste',
      },
      {
        key: 'history', kicker: '后悔药', title: '版本历史', hint: '⇧⌘H',
        desc: '每次保存都在本机留一个版本，逐行对比、一键恢复。别的编辑器或同步盘写进来的内容，在被覆盖前也会先留一份。',
        bullets: ['历史放在应用数据里，不污染笔记库和 Git 仓库', '连续的自动保存合并成一个版本，保留最近 60 天', '恢复本身也进历史，随时可以再撤回'],
        image: 'v262-history',
      },
      {
        key: 'semantic', kicker: '轻量 AI', title: '相关笔记与语义搜索',
        desc: '一个 26 MB 的本机嵌入模型读懂每篇笔记的意思：目录面板推荐「相关笔记」，搜索时用词不一样也能找到。和本机模型共用运行时，全程不出这台电脑。',
        bullets: ['智能 → 相关笔记：一键开启，笔记改动后自动增量更新', '可选 BGE-small / BGE-base / Qwen3-Embedding', '不想花钱也能用 AI：帮助 → 快速开始 AI，本机模型免费离线，Agnes 有免费额度'],
        image: 'v262-semantic',
      },
      {
        key: 'more', kicker: '还有这些', title: '写得更专心', hint: '⇧⌘.',
        desc: '专注模式收起侧边栏和工具栏，当前段落以外的内容淡出，光标所在行保持在屏幕中间。',
        bullets: ['⌘T 快速打开：敲几个字跳到笔记；⌘W / ⌘⇧T / ⌃Tab 管标签页', '设置 → 正文排版：字体、字号、行距、页面宽度', '源码模式左右滚动同步；预览里的任务列表有勾选框了', '导出单文件 HTML（图片内联）；PDF 里的本地图片和公式能正常显示了', '失焦自动保存不再改写没动过的文件'],
        image: 'v262-focus',
      },
    ],
  },
  {
    version: '26.1',
    title: '回归纯粹编辑器',
    releaseUrl: 'https://github.com/imoling/iml-markdown-editor/releases/tag/v26.1.0',
    removed: '公众号写作工作站、联网搜索与微信发布已整体移除。需要的话可以继续使用 v1.9.0 发布包，代码保留在 backup/v1.9.0-before-rewrite-20260913 分支。',
    pages: [
      {
        key: 'intro', kicker: '新特性', title: '回归纯粹编辑器',
        desc: '版本号从这一版起改为「年份.小版本」。这次更新围绕两件事：把笔记记得更顺手，把 AI 留在本机。',
        bullets: ['斜杠菜单、双向链接、全文搜索、每日日记', '本机模型：编辑器自己托管的离线 AI', '配置改为浮层，Dock 里只有一个窗口'],
        image: 'hero',
      },
      {
        key: 'slash', kicker: '记笔记', title: '斜杠插入菜单', hint: '/',
        desc: '空行输入 / ，标题、列表、任务、表格、代码块、公式、流程图、日期都在一个菜单里，继续输入即可筛选。',
        image: 'slash',
      },
      {
        key: 'wiki', kicker: '记笔记', title: '双向链接', hint: '[[',
        desc: '输入 [[ 弹出笔记候选，回车插入链接，点击直达；不存在的笔记会在当前目录里自动创建。',
        bullets: ['目录面板底部显示「反向链接」：谁引用了这篇', '源码模式同样支持 [[ 补全'],
        image: 'wiki',
      },
      {
        key: 'search', kicker: '记笔记', title: '全文搜索', hint: '⌘⇧F',
        desc: '搜整个笔记库，多个关键词按「都包含」匹配，命中片段高亮；回车打开笔记并定位到第一处。',
        image: 'search',
      },
      {
        key: 'daily', kicker: '记笔记', title: '每日日记与模板', hint: '⌘⇧D',
        desc: '一键打开今日日记，不存在就按模板新建。把笔记放进「模板」文件夹，新建时就能从模板开始。',
        bullets: ['模板支持 {{title}} {{date}} 等变量', '日记按日期归档在「日记」文件夹'],
        image: 'daily',
      },
      {
        key: 'local', kicker: '轻量 AI', title: '本机模型，零配置离线 AI', hint: '⌘⇧M',
        desc: '「智能 → 写作助手」里选「本机模型」，编辑器自动安装 llama.cpp 运行时，并按你的机器推荐讯飞星火、面壁 MiniCPM、Qwen 的小模型。',
        bullets: ['下载支持断点续传与 SHA256 校验', '请求只发往 127.0.0.1，笔记不出这台电脑', '也可导入自己的 GGUF 文件'],
        image: 'local',
      },
      {
        key: 'more', kicker: '还有这些', title: '更安静，也更顺手',
        desc: '一些不那么显眼、但每天都会用到的改动。',
        bullets: ['笔记库即工作区：可放进 iCloud Drive 多设备共用，外部改动自动刷新', '配置、关于、快捷键改为主窗口内的浮层', 'AI 气泡保持不变：空行按空格续写、画流程图；选中文字润色、总结、扩写', '查找替换、⌘K 插入链接、⌘P 导出 PDF、侧边栏拖拽调宽'],
        image: 'hero',
      },
    ],
  },
];

/** 当前版本对应的新特性条目（按大版本找：26.3.1 的热修也用 26.3 那篇）；没有为这一版写介绍时返回 null */
export function latestWhatsNew(currentVersion: string, entries: WhatsNewEntry[] = WHATS_NEW): WhatsNewEntry | null {
  const v = majorMinor(currentVersion);
  return entries.find((e) => e.version === v) ?? null;
}

/**
 * 新安装（没记录过）或升级到有介绍的新版本时展示；同一大版本的小修订不重复弹。
 */
export function shouldShowWhatsNew(currentVersion: string, lastSeenVersion: string | null | undefined, entries: WhatsNewEntry[] = WHATS_NEW): boolean {
  const entry = latestWhatsNew(currentVersion, entries);
  if (!entry) return false;
  if (!lastSeenVersion) return true;
  return majorMinor(lastSeenVersion) !== entry.version;
}
