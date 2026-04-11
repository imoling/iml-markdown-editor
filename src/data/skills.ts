// SKILL 数据定义：把场景写作升级为可编排的多步骤工作流。
// 模板变量：{{vibe}} {{outline}} {{section}} {{prevOutput}} {{webContext}} {{sectionIndex}} {{context}}

export type SkillStepKind =
  | 'brainstorm'
  | 'outline'
  | 'section'
  | 'draft'
  | 'polish'
  | 'cover'
  | 'custom'
  | 'publish';

export interface SkillStep {
  id: string;
  kind: SkillStepKind;
  label: string;
  description: string;
  systemPrompt: string;
  userPromptTemplate: string;
  optional?: boolean;
  // 当 kind=section 时，从哪个 step 取 outline
  outlineFromStepId?: string;
  // 当 kind=polish/custom 时，对哪个 step 的产物作为输入（{{prevOutput}}）
  polishFromStepId?: string;
  // outline 类型：true 表示用户只能选一条，后续步骤只用选中项
  singleSelect?: boolean;
  // 第二路上游输入，解析为 {{context}}（用于同时需要 outline + 框架/标题的场景）
  contextFromStepId?: string;
}

export interface PaletteEntry {
  id: string;
  label: string;
  stepId: string;
  /** 选中文本的注入位置：作为新的 vibe 还是作为 prevOutput（润色场景） */
  inputAs: 'vibe' | 'prevOutput';
}

export interface Skill {
  id: string;
  label: string;
  description: string;
  steps: SkillStep[];
  paletteEntries?: PaletteEntry[];
  /** 若设置，运行此 SKILL 时自动联网搜索（无需用户手动开联网开关） */
  autoSearchQuery?: string;
}

// ─────────────────────────────────────────────
// 润色功能选项（polish step 可多选组合）
// ─────────────────────────────────────────────
export interface PolishOption {
  id: string;
  label: string;
  description: string;
  promptAddition: string;
}

export const POLISH_OPTIONS: PolishOption[] = [
  {
    id: 'logic',
    label: '提升全文逻辑',
    description: '梳理段落顺序与论证链条，让文章更连贯',
    promptAddition:
      '【逻辑提升】请审视全文段落顺序和论证结构：检查观点是否自然递进、段落间过渡是否流畅、核心论点是否有充分支撑。必要时调整段落顺序或补充衔接句，使文章读起来层层深入、有说服力。',
  },
  {
    id: 'hooks',
    label: '首尾钩子',
    description: '强化开篇吸引力与结尾行动号召',
    promptAddition:
      '【首尾钩子】开篇：前 2~3 句必须立刻抓住读者，可用数字冲击、反常识断言、场景代入或痛点共鸣，禁止用"在当今时代"等泛化开场。结尾：给出明确的行动号召或留下引发读者反思的问题，避免"总结一下"式的万能结尾。',
  },
  {
    id: 'deai',
    label: '去 AI 味',
    description: '去除 AI 痕迹，让文字更自然真实',
    promptAddition:
      '【去 AI 味】按以下 24 条标准检查并重写：\n' +
      '内容层面：① 删除"意义深远、影响深远"等空洞升华；② 删除"广受关注、业界瞩目"等自我吹捧；③ 去掉以"-ing 趋势"结尾的浅层分析；④ 删除广告促销语气；⑤ 把"据报道、有观点认为"等模糊归因改为具体来源或直接陈述；⑥ 避免"挑战与展望"套路结构。\n' +
      '语言层面：⑦ 删除"此外、至关重要、深入探讨、值得注意"等 AI 高频词；⑧ 少用"是"的替代词（呈现为、体现为）；⑨ 避免反义并列（"不仅……更……"）堆砌；⑩ 减少三点并列（"第一……第二……第三……"）；⑪ 不要为了变化刻意换同义词；⑫ 删除假范围词（"在某种程度上"）。\n' +
      '风格层面：⑬ 减少破折号；⑭ 减少加粗（只保留真正关键处）；⑮ 不要"行内标题+竖排列表"结构；⑯ 标题只首字母大写；⑰ 去掉 emoji（除非原文风格需要）；⑱ 使用直引号。\n' +
      '语气层面：⑲ 删除"我理解您的需求"等协作痕迹；⑳ 删除"截至知识截止日期"等时效声明；㉑ 去掉谄媚客套；㉒ 删除填充语；㉓ 减少过度限定词；㉔ 结尾不要"总结而言，以上就是"万能收尾。\n' +
      '改写方向：表达观点而非罗列事实；长短句交替制造节奏；用具体细节替换抽象概括；适度使用第一人称；允许句式不完美，但要有真实的人味。',
  },
  {
    id: 'factcheck',
    label: '事实性检查',
    description: '标注存疑的数据、引用与事实性陈述',
    promptAddition:
      '【事实性检查】逐段扫描文中的数据、统计、引用、历史事件和产品特性等事实性内容。对你不能 100% 确认的内容，在该句末尾添加 [⚠️ 存疑：请核实] 标记，并在文末汇总一个"需核实清单"列表，说明每条存疑的原因（如数据来源不明、版本可能过期等）。不要删改原文观点，只做标注。',
  },
];

// 根据选中的选项 ID 组合最终系统提示
export function buildPolishSystemPrompt(basePrompt: string, optionIds: string[]): string {
  if (!optionIds || optionIds.length === 0) return basePrompt;
  const additions = optionIds
    .map((id) => POLISH_OPTIONS.find((o) => o.id === id))
    .filter(Boolean)
    .map((o) => o!.promptAddition);
  if (additions.length === 0) return basePrompt;
  return `${basePrompt}\n\n${additions.join('\n\n')}`;
}

// ─────────────────────────────────────────────
// 公共系统提示（沿用现有写作面板的风格）
// ─────────────────────────────────────────────
const OUTLINE_SYSTEM =
  '你是一位专业的文档架构师。你的任务是根据用户灵感（以及可能的联网搜索上下文）输出简洁的大纲要点列表。每条要点独占一行，使用"序号. 内容"格式。只输出列表，不要有任何额外文字。';

const DRAFT_SYSTEM =
  '您是一位专业的文档写作助手。您的任务是严格按照用户已确认的大纲，展开撰写完整的 Markdown 文档。特别注意：在生成 Mermaid 图表时，节点标签内容若需换行请使用 <br/> 而非实际回车，且确保所有括号和括号内的特殊字符正确闭合。严禁包含任何如"好的"、"收到"之类的对话式引导，即刻开始，只输出 Markdown 本身。';

const SECTION_SYSTEM =
  '您是一位专业的写作助手。您将就大纲中的某一个要点单独展开撰写。要求：紧扣该要点本身，不要重复其他要点的内容；保持与整体上下文的一致性；输出 Markdown 片段（可包含小标题），不要有任何客套话与前后引导。';

const POLISH_SYSTEM =
  '您是一位资深润色编辑。请在保留原意与结构的前提下，提升表达的专业度、流畅度与节奏感。直接输出润色后的 Markdown 全文，不要解释你做了什么。';

const BRAINSTORM_SYSTEM =
  '您是一位创意发散助手。请围绕用户输入进行多角度思考，输出 5~8 条简短、互不重复的发散点（每行一条，不必编号）。只输出列表本身。';

// 通用 step 工厂
function outlineStep(prompt: (vibe: string) => string): SkillStep {
  return {
    id: 'outline',
    kind: 'outline',
    label: '生成大纲',
    description: '把灵感拆成可编辑的要点列表',
    systemPrompt: OUTLINE_SYSTEM,
    userPromptTemplate:
      '{{webContext?以下是联网搜索到的背景信息：\n{{webContext}}\n\n基于以上信息和我的灵感，生成大纲：\n}}' +
      prompt('{{vibe}}'),
  };
}

function draftStep(prompt: (vibe: string, outline: string) => string): SkillStep {
  return {
    id: 'draft',
    kind: 'draft',
    label: '撰写全文',
    description: '按确认后的大纲展开成完整文档',
    systemPrompt: DRAFT_SYSTEM,
    userPromptTemplate: prompt('{{vibe}}', '{{outline}}'),
    outlineFromStepId: 'outline',
  };
}

function sectionStep(label: string, hint: string): SkillStep {
  return {
    id: 'sections',
    kind: 'section',
    label,
    description: hint,
    systemPrompt: SECTION_SYSTEM,
    userPromptTemplate:
      '主题灵感：{{vibe}}\n\n完整大纲：\n{{outline}}\n\n请仅就以下第 {{sectionIndex}} 个要点展开撰写：\n{{section}}',
    outlineFromStepId: 'outline',
    optional: true,
  };
}

function polishStep(): SkillStep {
  return {
    id: 'polish',
    kind: 'polish',
    label: '润色定稿',
    description: '提升表达的专业度与节奏',
    systemPrompt: POLISH_SYSTEM,
    userPromptTemplate: '请润色以下 Markdown 文档：\n\n{{prevOutput}}',
    polishFromStepId: 'draft',
    optional: true,
  };
}

function brainstormStep(): SkillStep {
  return {
    id: 'brainstorm',
    kind: 'brainstorm',
    label: '发散灵感',
    description: '多角度补充、激发新的切入点',
    systemPrompt: BRAINSTORM_SYSTEM,
    userPromptTemplate: '请围绕以下主题进行发散：\n{{vibe}}',
    optional: true,
  };
}

// ─────────────────────────────────────────────
// 6 个 SKILL（迁移自原 SCENARIOS）
// PRD 作为示范，包含 brainstorm + outline + sections + polish 完整 4 步
// 其他保持 outline + draft 两步以兼容
// ─────────────────────────────────────────────
export const SKILLS: Skill[] = [
  {
    id: 'prd',
    label: 'AI 编程需求文档',
    description: '将用户灵感转化为 AI 编程需求 PRD 文档',
    steps: [
      brainstormStep(),
      {
        id: 'outline',
        kind: 'outline',
        label: '生成大纲',
        description: '6~8 条 PRD 核心要点',
        systemPrompt: OUTLINE_SYSTEM,
        userPromptTemplate:
          '{{webContext?以下是联网搜索到的背景信息：\n{{webContext}}\n\n}}请根据以下用户灵感，生成一份 PRD 文档的大纲要点。只输出 6~8 条核心要点，每条一行，使用"序号. 要点内容"的格式。不要输出正文，不要有任何前言后语。\n\n用户灵感: "{{vibe}}"',
      },
      sectionStep('逐节撰写', '按大纲逐项独立生成，可单独重生'),
      {
        id: 'draft',
        kind: 'draft',
        label: '整体撰写（备选）',
        description: '一次性按大纲写完整 PRD（与逐节二选一）',
        systemPrompt: DRAFT_SYSTEM,
        userPromptTemplate:
          '您是一位资深的 PRD 专家。请根据以下用户灵感和已确认的大纲，编写一份详尽的 Markdown 格式 PRD 文档。请严格按照大纲结构展开，每个要点都需要深入阐述。直接输出文档内容，不要有任何开场白或结束语。\n\n用户灵感: "{{vibe}}"\n\n已确认的大纲:\n{{outline}}',
        outlineFromStepId: 'outline',
        optional: true,
      },
      polishStep(),
    ],
    paletteEntries: [
      { id: 'prd-outline', label: 'PRD · 仅生成大纲', stepId: 'outline', inputAs: 'vibe' },
      { id: 'prd-polish', label: 'PRD · 润色当前选区', stepId: 'polish', inputAs: 'prevOutput' },
    ],
  },
  {
    id: 'ai-studio',
    label: 'AI Studio 验证系统',
    description: '生成 Google AI Studio 验证系统提示词',
    steps: [
      outlineStep(
        (v) =>
          `请根据以下需求，生成一段 AI Studio 系统指令的大纲要点。只输出 5~7 条核心要点，每条一行，使用"序号. 要点内容"的格式。不要输出正文，不要有任何前言后语。\n\n用户需求: "${v}"`,
      ),
      draftStep(
        (v, o) =>
          `请根据用户需求和已确认的大纲，生成一段用于 Google AI Studio 的系统级指令（System Prompt）。该指令应指导 AI 表现为一个具备特定能力边界、交互规范和技术逻辑的功能原型。使用 Markdown 格式输出。严格按照大纲展开。直接输出系统指令内容，严禁废话。\n\n用户需求: "${v}"\n\n已确认的大纲:\n${o}`,
      ),
      polishStep(),
    ],
  },
  {
    id: 'stitch',
    label: 'Stitch 原型设计',
    description: '生成 Stitch 高交互界面提示词',
    steps: [
      outlineStep(
        (v) =>
          `请根据以下设计构想，生成界面原型设计指令的大纲要点。只输出 5~7 条核心要点，每条一行，使用"序号. 要点内容"的格式。不要输出正文，不要有任何前言后语。\n\n设计构想: "${v}"`,
      ),
      draftStep(
        (v, o) =>
          `请将以下设计构想转化为专门用于 Stitch 的"视觉工程"设计指令。严格按照大纲展开，精准描述页面布局、关键交互动效、组件规格以及整体设计语言。使用 Markdown 格式直接输出指令，不需要任何额外解释。\n\n设计构想: "${v}"\n\n已确认的大纲:\n${o}`,
      ),
    ],
  },
  {
    id: 'nanobanana',
    label: 'Nano Banana PPT',
    description: '定制 Nano Banana Pro 级别高审美 PPT 提示词',
    steps: [
      outlineStep(
        (v) =>
          `请根据以下主题，确定 PPT 的 5~7 页核心大纲（如：封面、痛点场景、方案核心、技术优势、愿景）。只输出要点内容，不必写具体 Prompt，每条一行，使用"序号. 要点内容"的格式。\n\n主题: "${v}"`,
      ),
      sectionStep('逐页精修', '按页独立生成视觉与文案'),
      draftStep(
        (v, o) =>
          `您是一位顶级的 PPT 演示设计专家，擅长将业务逻辑转化为极具视觉冲击力的提示词。请基于以下主题和大纲，生成一份专门用于"文生 PPT"AI 工具（如 Nano Banana Pro / Gamma）的高级指令。\n\n### 生成要求：\n1. 风格设定：根据内容自动推荐一种高审美风格（如：Apple Keynote 极简、Cyberpunk 霓虹、SaaS 弥散渐变、工业蓝图感）。\n2. 全局规范：描述配色（HEX 码）、字体组合、背景纹理、整体氛围。\n3. 逐页精修：针对大纲每一页，输出布局 (Layout)、视觉元素 (Visuals，含文生图提示词)、文案内容 (Copy)。\n\n直接输出 Markdown 格式的指令全集，不要有任何客套话。\n\n主题: "${v}"\n\n已确认的大纲:\n${o}`,
      ),
    ],
  },
  {
    id: 'report',
    label: '职场心流复盘',
    description: '日常工作整理成极具逻辑的专业汇报',
    steps: [
      outlineStep(
        (v) =>
          `请根据以下工作记录，生成一份专业汇报的大纲要点。只输出 5~7 条核心要点，每条一行，使用"序号. 要点内容"的格式。不要输出正文，不要有任何前言后语。\n\n工作记录: "${v}"`,
      ),
      draftStep(
        (v, o) =>
          `请根据以下工作记录和已确认的大纲，将其"重构"为一份正式、精美且极具逻辑的专业汇报。严格按照大纲展开。使用 Markdown 格式。直接输出正文，不要有任何客套话。\n\n工作记录: "${v}"\n\n已确认的大纲:\n${o}`,
      ),
      polishStep(),
    ],
    paletteEntries: [
      { id: 'report-polish', label: '复盘 · 润色当前选区', stepId: 'polish', inputAs: 'prevOutput' },
    ],
  },
  // ── 微信公众号热点写作（选题 → 策略 → 大纲 → 写作 → 发布）──
  {
    id: 'wechat-hot-topic',
    label: '公众号热点写作',
    description: '选题推荐 → 大纲策略 → 正文撰写 → 排版发布',
    steps: [
      // Step 1: 直接给出选题推荐（富格式，含钩子 + 大纲思路）
      {
        id: 'topic_suggest',
        kind: 'outline',
        singleSelect: true,
        label: '选题推荐',
        description: '5~8 条选题，含标题 · 钩子 · 大纲思路，点选一条展开',
        systemPrompt:
          '你是一位资深微信公众号运营专家，熟悉各垂直领域的内容创作，擅长将热点话题转化为爆款选题。\n\n根据用户提供的关键词和参考资讯，输出 5~8 条微信公众号选题推荐。\n\n严格按照以下格式，每条占一行，使用"序号. 内容"格式：\n序号. 标题建议｜钩子：一句话开篇钩子（制造悬念/数字冲击/痛点共鸣）｜大纲：① 要点一 ② 要点二 ③ 要点三 ④ 要点四\n\n示例（职场方向）：\n1. 月薪 3 万的人，都在偷偷做这件事｜钩子：你以为努力就够了？他们早就换了打法｜大纲：① 高收入者的时间分配模型 ② 3 个被低估的职场杠杆 ③ 常见误区 ④ 今天就能开始的行动清单\n\n选题要贴近目标读者的真实痛点，标题要有悬念感或数字冲击力。只输出列表，不要有任何前言后语或解释说明。',
        userPromptTemplate:
          '关键词/方向：{{vibe}}\n\n{{webContext?参考最新热点资讯：\n{{webContext}}\n\n}}请针对上述关键词，生成 5~8 条有爆款潜力的微信公众号选题推荐（格式严格按示例）。',
      },
      // Step 1b: 文章框架选择（可选）
      {
        id: 'article_type',
        kind: 'outline',
        singleSelect: true,
        optional: true,
        label: '文章框架',
        description: '6 种写作结构，点选一种，大纲将按此框架组织',
        systemPrompt:
          '你是微信公众号内容策略师。根据选定选题，输出 6 种适合的文章写作框架选项。\n\n严格按以下格式，每条占一行，使用"序号. 内容"格式：\n序号. 框架名：结构描述（用"→"连接各节点）\n\n固定输出以下 6 条（顺序不变）：\n1. 干货教程：痛点 → 根因分析 → 操作步骤（清单） → 总结 → 行动号召\n2. 故事叙述：场景铺垫 → 冲突事件 → 转折时刻 → 启示提炼 → 读者共鸣呼吁\n3. 观点评论：现象切入 → 多角度分析 → 核心观点 → 反驳预设 → 立场呼吁\n4. 产品测评：用户痛点 → 产品定位 → 实测过程 → 横向对比 → 适用人群结论\n5. 趋势解读：背景铺垫 → 数据/案例佐证 → 多维影响分析 → 应对策略建议\n6. 案例拆解：结果先行（结论前置） → 背景还原 → 关键动作拆解 → 可复制方法论\n\n只输出列表，不要任何前言后语。',
        userPromptTemplate:
          '选定选题：{{outline}}\n\n请输出适合该选题的 6 种文章框架选项。',
        outlineFromStepId: 'topic_suggest',
      },
      // Step 2b: 标题工场（必选，在大纲前锁定标题）
      {
        id: 'title_factory',
        kind: 'outline',
        singleSelect: true,
        label: '标题工场',
        description: '5 种角度 × 3 个变体 = 15 个候选标题，点选一个',
        systemPrompt:
          '你是爆款标题专家，深谙微信公众号点击心理。根据选定选题，按 5 种角度各生成 3 个标题候选，共 15 个。\n\n角度说明：\n- 悬念型：制造信息缺口，让读者必须点进来才能解答\n- 对比型：用数字/反差制造冲击感\n- 场景型：精准描述目标读者的具体场景\n- 观点型：鲜明立场，敢于表达反常识判断\n- 共鸣型：戳中情绪痛点，引发"这说的就是我"\n\n严格按以下格式，每条占一行：\n序号. 标题内容\n\n示例：\n1. 我用了3个月才搞懂的事，你只需要看这篇\n2. ...\n\n只输出纯标题列表，不要在标题前加【角度】前缀，不要任何解释。',
        userPromptTemplate:
          '关注方向：{{vibe}}\n\n选定选题：\n{{outline}}\n\n请按 5 种角度各生成 3 个标题候选（共 15 个）。',
        outlineFromStepId: 'topic_suggest',
      },
      // Step 2: 文章大纲（标题已由标题工场锁定，此步聚焦结构策略）
      {
        id: 'article_outline',
        kind: 'outline',
        label: '文章大纲',
        description: '目标读者 · 开篇钩子 · 分节结构，可在此调整',
        systemPrompt:
          '你是一位兼具运营洞察与内容架构能力的微信公众号专家。\n文章标题已由用户选定，无需再生成标题，直接输出内容策略与大纲。\n\n输出格式（每条独占一行，使用"序号. 内容"）：\n1. 目标读者：xxx（具体描述谁会读并转发，一句话）\n2. 开篇钩子：xxx（一句制造悬念或痛点共鸣的开场白）\n3. 第一节标题\n4. 第二节标题\n5. 第三节标题\n6. 第四节标题\n7. （可选）第五节标题\n8. 结尾行动号召：xxx（评论/转发/收藏的引导语）\n\n只输出列表，不要有任何前言后语。',
        userPromptTemplate:
          '关注方向：{{vibe}}\n\n已锁定标题：「{{context}}」\n\n选定选题（含思路供参考）：\n{{outline}}\n\n请围绕上述标题，生成完整的内容策略 + 大纲列表。',
        outlineFromStepId: 'topic_suggest',
        contextFromStepId: 'title_factory',
      },
      // Step 3: 封面图
      {
        id: 'cover',
        kind: 'cover',
        label: '封面图',
        description: '网络爬取或 AI 生成 3 张封面，点选确认',
        systemPrompt: '',
        userPromptTemplate: '{{vibe}}',
        outlineFromStepId: 'article_outline',
      },
      // Step 4: 全文撰写
      {
        id: 'draft',
        kind: 'draft',
        label: '正文撰写',
        description: '公众号风格全文，含 emoji 与金句',
        systemPrompt:
          '你是一位顶级微信公众号写手，文章多次 10w+，风格兼具干货与情感温度。\n撰写规范：\n1. 开篇直接使用大纲中的"开篇钩子"，前 3 行必须抓住读者\n2. 每个章节内有 1~2 个具体案例或数据支撑\n3. 善用 emoji 增加视觉节奏（每段 1~2 个，不要滥用）\n4. 金句单独成段，加粗\n5. 结尾使用大纲中的行动号召\n6. 全文 1500~2500 字\n7. 只输出 Markdown 正文，不要任何前后说明',
        userPromptTemplate:
          '关注方向：{{vibe}}\n\n{{context?【标题已锁定】请严格使用以下标题作为文章标题，不得更改：\n「{{context}}」\n\n}}文章大纲（目标读者、章节结构、钩子、行动号召等）：\n{{outline}}\n\n请按上述大纲撰写完整的微信公众号文章正文。',
        outlineFromStepId: 'article_outline',
        contextFromStepId: 'title_factory',
      },
      // Step 4b: 插图提示词（可选）
      {
        id: 'illustrations',
        kind: 'custom',
        optional: true,
        label: '插图提示词',
        description: '分析正文，分图给出插图位置和文生图提示词',
        systemPrompt:
          '你是视觉内容策划师，精通微信公众号配图策略。阅读文章后，在最适合配图的位置给出插图建议（每 500 字约 1 张，全文 3~5 张）。\n\n严格按以下 JSON 格式输出，不要加 markdown 代码块包裹，不要其他任何文字：\n[\n  {"n":1,"position":"第X段/「小标题」之后","prompt":"具体英文画面描述，含场景/人物/氛围/构图/色调/风格，30~60词，画面感强烈"},\n  {"n":2,"position":"...","prompt":"..."}\n]',
        userPromptTemplate: '请分析以下文章，给出 3~5 张插图建议（JSON 格式）：\n\n{{prevOutput}}',
        polishFromStepId: 'draft',
      },
      // Step 5: 润色（可选）
      {
        id: 'polish',
        kind: 'polish',
        label: '润色定稿',
        description: '两阶段：静默分析原文 → 保留作者风格地全面优化',
        systemPrompt:
          '你是一位专注微信公众号的资深编辑。\n\n第一步：默读原文（不输出任何内容），在心里完成以下分析：\n- 主题提炼：文章的核心观点是什么？\n- 受众判断：面向什么读者？\n- 风格识别：正式 / 口语 / 叙事 / 议论？\n- 问题诊断：逻辑跳跃？晦涩表达？冗余重复？结构不清？\n\n第二步：基于分析，对原文进行优化，遵循：\n1. 保留原意（最高优先级，不改变作者观点和立场）\n2. 通俗易懂（简单词替换晦涩术语，必要时保留术语但加括号解释）\n3. 逻辑通顺（补充段落间衔接，确保自然递进）\n4. 精简冗余（删重复表达，但不过度删减导致信息丢失）\n5. 语感自然（读起来像人写的，不像 AI 生成）\n6. 必要时调整结构（可重排段落顺序，但不遗漏、不添加任何内容）\n\n注意事项：\n- 英文词汇（thread、hook、roadmap 等）后加中文注释，如"hook（钩子）"；但品牌名/产品名（ChatGPT、Midjourney、GitHub 等）保持原样\n- 不要添加原文没有的观点，可补充衔接语\n- 避免"在当今社会""不言而喻""值得注意的是"等 AI 套话\n- 强化开篇前 3 行的吸引力\n- 结尾给出有互动感的行动号召或引发读者反思的问题\n- 提炼 2~3 句适合截图传播的金句（加粗 + 独立成段）\n- 优化段落节奏（过长段落拆分，过短段落合并）\n- 全程保留 emoji，堆砌处适当减少\n\n直接输出润色后的完整 Markdown，不要解释做了什么改动。',
        userPromptTemplate: '请润色以下微信公众号文章：\n\n{{prevOutput}}',
        polishFromStepId: 'draft',
        optional: true,
      },
      // Step 5b: 微信排版预览（可选）
      {
        id: 'wechat_html',
        kind: 'custom',
        optional: true,
        label: '排版预览',
        description: '选择主题，生成微信图文 HTML，支持一键预览',
        systemPrompt:
          '你是微信公众号排版专家。将 Markdown 转换为微信公众号兼容的完整 HTML，严格遵守以下规范：\n\n【技术约束】\n- 所有样式使用 inline style，禁止 `<style>` 标签或 class\n- 只用 `<section><span><strong><em>` 标签\n- 禁用 `<div><p><ul><li>`，禁用 position 属性\n- 全局字体（每个元素都要加）：font-family:"mp-quote",PingFang SC,system-ui,-apple-system,BlinkMacSystemFont,"Helvetica Neue","Hiragino Sans GB","Microsoft YaHei UI","Microsoft YaHei",Arial,sans-serif\n\n【色彩系统】根据用户指定的主题色（Hex）：\n- 主色用于编号色块、标题装饰、高亮背景\n- 正文色 #3d3d3d，标题色 #1a1a1a\n\n【结构（依次输出）】\n1. 首段引言：font-size:19px，line-height:1.9，底部 1px solid #e8e8e8；字体同上（注意：不要输出文章标题，直接从引言正文开始）\n2. 正文：font-size:17px，line-height:1.9，letter-spacing:0.5px，text-align:justify；小标题用主色编号色块（01、02...）；字体同上\n3. 文末三圆点装饰\n4. 浅灰关注引导卡片；字体同上\n\n【转换规则】\n- `**加粗**` → font-weight:bold + background:rgba(主色,0.15) 荧光笔\n- `> 引用` → 浅色背景卡片，左侧主色竖线，font-style:normal\n- 列表项 → border-left:3px solid 主色 的独立卡片，带 ①②③\n- `---` → 三圆点替代\n\n直接输出 HTML，第一个字符必须是 `<`，不得有任何前言、思考过程、解释或 Markdown 代码块包裹。',
        userPromptTemplate:
          '主题色：{{themeColor}}\n\n请将以下文章转换为微信公众号排版 HTML：\n\n{{prevOutput}}',
        polishFromStepId: 'polish',
      },
    ],
  },
  // ── 原有技术骨架 SKILL ──
  {
    id: 'tech',
    label: '架构拆解与工程化',
    description: '生成 Vibe Coding 技术骨架并模块化拆解',
    steps: [
      outlineStep(
        (v) =>
          `请根据以下技术需求，生成一份架构设计文档的大纲要点。只输出 6~8 条核心要点，每条一行，使用"序号. 要点内容"的格式。不要输出正文，不要有任何前言后语。\n\n技术需求: "${v}"`,
      ),
      sectionStep('逐模块设计', '每个模块独立展开，可单独重生'),
      draftStep(
        (v, o) =>
          `请为以下技术需求编写一份详细的技术架构设计与模块化拆解文档。严格按照已确认的大纲展开，包含但不限于：技术选型逻辑、核心模块定义、数据流动模型以及稳定性保障策略。使用 Markdown 格式。直接输出内容，排除任何辅助性说明。\n\n技术需求: "${v}"\n\n已确认的大纲:\n${o}`,
      ),
    ],
  },
];

export function getSkillById(id: string): Skill | undefined {
  return SKILLS.find((s) => s.id === id);
}

export function getStepById(skill: Skill, stepId: string): SkillStep | undefined {
  return skill.steps.find((s) => s.id === stepId);
}

// ─────────────────────────────────────────────
// 模板渲染
// 支持：
//   {{var}}                    简单替换
//   {{var?prefix{{var}}suffix}} 条件块（var 非空时整段渲染，否则丢弃）
// ─────────────────────────────────────────────
export function renderTemplate(
  tpl: string,
  vars: Record<string, string | number | undefined>,
): string {
  // 先处理条件块
  let out = tpl.replace(/\{\{(\w+)\?([\s\S]*?)\}\}(?=(?:[^{]|\{(?!\{))*?$)/g, () => '');
  // 上面那个 lookahead 太复杂，改用更简单的两遍处理
  out = tpl;
  // 条件块：{{name?...}}（内部可包含 {{name}}）
  // 用一个非贪婪扫描：从 {{name? 开始，找到匹配的最外层 }}
  out = expandConditionals(out, vars);
  // 普通替换
  out = out.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined || v === null ? '' : String(v);
  });
  return out;
}

function expandConditionals(
  tpl: string,
  vars: Record<string, string | number | undefined>,
): string {
  const re = /\{\{(\w+)\?/g;
  let result = '';
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tpl)) !== null) {
    const start = m.index;
    const name = m[1];
    // 从 m.index + m[0].length 开始扫描，找到匹配的 }}
    let i = start + m[0].length;
    let depth = 1;
    while (i < tpl.length && depth > 0) {
      if (tpl[i] === '{' && tpl[i + 1] === '{') {
        depth++;
        i += 2;
      } else if (tpl[i] === '}' && tpl[i + 1] === '}') {
        depth--;
        i += 2;
      } else {
        i++;
      }
    }
    const inner = tpl.slice(start + m[0].length, i - 2);
    result += tpl.slice(lastIndex, start);
    const v = vars[name];
    if (v !== undefined && v !== null && String(v).length > 0) {
      // 递归展开 inner
      result += expandConditionals(inner, vars);
    }
    lastIndex = i;
    re.lastIndex = i;
  }
  result += tpl.slice(lastIndex);
  return result;
}
