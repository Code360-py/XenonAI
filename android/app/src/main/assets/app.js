(function() {
    "use strict";

    const STORAGE_SESSIONS = "xenon_sessions_v1";
    const STORAGE_SETTINGS = "xenon_settings_v1";
    const STORAGE_THEME = "xenon_theme_pref";

    let sessions = [];
    let currentSessionId = null;

    let currentTab = "chat";
    let activeCategory = "general";
    let modelSearchQuery = "";
    let historySearchQuery = "";

    let callbackSeq = 1;
    let startTime = 0;
    let rawBotBuffer = "";
    let isGenerating = false;
    let lastUserPrompt = "";
    let lastBotBubble = null;
    let lastBotWrapper = null;

    // Feature Switches
    let optMarkdown = true;
    let optHighlight = true;
    let optHistory = true;
    let optHaptic = false;

    // 40-Model Catalog
    const MODEL_CATALOG = {
        general: [
            { name: "Qwen 2.5 0.5B Instruct", filename: "qwen2.5-0.5b-instruct-q4_k_m.gguf", quant: "Q4_K_M", sizeMb: 398, ram: "~0.8 GB", desc: "Fastest response time, ultralight edge model.", url: "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf" },
            { name: "Qwen 2.5 1.5B Instruct", filename: "qwen2.5-1.5b-instruct-q4_k_m.gguf", quant: "Q4_K_M", sizeMb: 986, ram: "~1.6 GB", desc: "Best quality/memory balance for general use.", url: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf" },
            { name: "Llama 3.2 1B Instruct", filename: "Llama-3.2-1B-Instruct-Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 800, ram: "~1.4 GB", desc: "Meta's official compact multilingual model.", url: "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf" },
            { name: "Llama 3.2 3B Instruct", filename: "Llama-3.2-3B-Instruct-Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 2020, ram: "~2.8 GB", desc: "High reasoning depth and conversational fidelity.", url: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf" },
            { name: "SmolLM2 135M Instruct", filename: "SmolLM2-135M-Instruct-Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 110, ram: "~0.3 GB", desc: "Extreme low-RAM instant responder.", url: "https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct-GGUF/resolve/main/smollm2-135m-instruct-q4_k_m.gguf" },
            { name: "SmolLM2 360M Instruct", filename: "SmolLM2-360M-Instruct-Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 245, ram: "~0.5 GB", desc: "Fast micro-assistant for low-end devices.", url: "https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/main/smollm2-360m-instruct-q4_k_m.gguf" },
            { name: "SmolLM2 1.7B Instruct", filename: "SmolLM2-1.7B-Instruct-Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 1100, ram: "~1.8 GB", desc: "HuggingFace's flagship mobile general agent.", url: "https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/resolve/main/smollm2-1.7b-instruct-q4_k_m.gguf" },
            { name: "Gemma 2 2B IT", filename: "gemma-2-2b-it-Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 1600, ram: "~2.3 GB", desc: "Google DeepMind's compact conversational engine.", url: "https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf" },
            { name: "Phi-3.5 Mini Instruct", filename: "Phi-3.5-mini-instruct-Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 2390, ram: "~3.1 GB", desc: "Microsoft's 3.8B model competitive with 7B.", url: "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf" },
            { name: "Danube3 500M Chat", filename: "h2o-danube3-500m-chat-Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 360, ram: "~0.7 GB", desc: "H2O.ai's edge model optimized for dialogue.", url: "https://huggingface.co/h2oai/h2o-danube3-500m-chat-GGUF/resolve/main/h2o-danube3-500m-chat-Q4_K_M.gguf" }
        ],
        reasoning: [
            { name: "DeepSeek R1 Distill Qwen 1.5B", filename: "DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 1120, ram: "~1.7 GB", desc: "Step-by-step thinking & math reasoning on device.", url: "https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf" },
            { name: "Marco-o1 7B Preview", filename: "marco-o1-q4_k_m.gguf", quant: "Q4_K_M", sizeMb: 4680, ram: "~5.5 GB", desc: "Open reasoning model with chain-of-thought tokens.", url: "https://huggingface.co/AIDC-AI/Marco-o1-GGUF/resolve/main/marco-o1-q4_k_m.gguf" },
            { name: "Qwen 2.5 Math 1.5B", filename: "qwen2.5-math-1.5b-instruct-q4_k_m.gguf", quant: "Q4_K_M", sizeMb: 990, ram: "~1.6 GB", desc: "Tuned specifically for arithmetic & STEM proofs.", url: "https://huggingface.co/Qwen/Qwen2.5-Math-1.5B-Instruct-GGUF/resolve/main/qwen2.5-math-1.5b-instruct-q4_k_m.gguf" },
            { name: "Bespoke-Starchat 1B", filename: "bespoke-starchat-1b-q4_k_m.gguf", quant: "Q4_K_M", sizeMb: 760, ram: "~1.3 GB", desc: "Logic-tree analysis and deductive verification.", url: "https://huggingface.co/bartowski/Bespoke-Starchat-1B-GGUF/resolve/main/Bespoke-Starchat-1B-Q4_K_M.gguf" },
            { name: "Nemotron-Mini 4B Instruct", filename: "Nemotron-Mini-4B-Instruct-Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 2650, ram: "~3.6 GB", desc: "NVIDIA's synthetic reasoning tuned edge model.", url: "https://huggingface.co/bartowski/Nemotron-Mini-4B-Instruct-GGUF/resolve/main/Nemotron-Mini-4B-Instruct-Q4_K_M.gguf" },
            { name: "Qwen 2.5 3B Instruct", filename: "qwen2.5-3b-instruct-q4_k_m.gguf", quant: "Q4_K_M", sizeMb: 2100, ram: "~2.9 GB", desc: "Multi-turn analytical and structured deduction.", url: "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf" },
            { name: "Hermes 3 Llama 3.2 3B", filename: "Hermes-3-Llama-3.2-3B-Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 2020, ram: "~2.8 GB", desc: "Nous Research logical agent with function calls.", url: "https://huggingface.co/NousResearch/Hermes-3-Llama-3.2-3B-GGUF/resolve/main/Hermes-3-Llama-3.2-3B.Q4_K_M.gguf" },
            { name: "Danube3 4B Instruct", filename: "h2o-danube3-4b-chat-Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 2580, ram: "~3.4 GB", desc: "Deep reasoning across long contextual windows.", url: "https://huggingface.co/h2oai/h2o-danube3-4b-chat-GGUF/resolve/main/h2o-danube3-4b-chat-Q4_K_M.gguf" },
            { name: "Arcee Agent 1.5B", filename: "arcee-agent-1.5b-q4_k_m.gguf", quant: "Q4_K_M", sizeMb: 990, ram: "~1.5 GB", desc: "Autonomous workflow planning and decomposition.", url: "https://huggingface.co/bartowski/Arcee-Agent-1.5B-GGUF/resolve/main/Arcee-Agent-1.5B-Q4_K_M.gguf" },
            { name: "StableLM 2 1.6B Zephyr", filename: "stablelm-2-zephyr-1_6b-Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 1040, ram: "~1.7 GB", desc: "Stability AI's direct preference optimization model.", url: "https://huggingface.co/second-state/stablelm-2-zephyr-1.6b-GGUF/resolve/main/stablelm-2-zephyr-1_6b-Q4_K_M.gguf" }
        ],
        coding: [
            { name: "Qwen 2.5 Coder 0.5B", filename: "qwen2.5-coder-0.5b-instruct-q4_k_m.gguf", quant: "Q4_K_M", sizeMb: 410, ram: "~0.8 GB", desc: "Sub-second code completion for C, Python, JS.", url: "https://huggingface.co/Qwen/Qwen2.5-Coder-0.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-0.5b-instruct-q4_k_m.gguf" },
            { name: "Qwen 2.5 Coder 1.5B", filename: "qwen2.5-coder-1.5b-instruct-q4_k_m.gguf", quant: "Q4_K_M", sizeMb: 1020, ram: "~1.6 GB", desc: "Top mobile code generation and syntax debugger.", url: "https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf" },
            { name: "Qwen 2.5 Coder 3B", filename: "qwen2.5-coder-3b-instruct-q4_k_m.gguf", quant: "Q4_K_M", sizeMb: 2150, ram: "~3.0 GB", desc: "Generates full functions, algorithms & refactoring.", url: "https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q4_k_m.gguf" },
            { name: "StarCoder2 3B", filename: "starcoder2-3b-Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 1980, ram: "~2.7 GB", desc: "Trained by BigCode across 80+ programming languages.", url: "https://huggingface.co/second-state/StarCoder2-3B-GGUF/resolve/main/starcoder2-3b-Q4_K_M.gguf" },
            { name: "DeepSeek Coder 1.3B", filename: "deepseek-coder-1.3b-instruct.Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 890, ram: "~1.4 GB", desc: "Project-level architecture and unit test creator.", url: "https://huggingface.co/TheBloke/deepseek-coder-1.3b-instruct-GGUF/resolve/main/deepseek-coder-1.3b-instruct.Q4_K_M.gguf" },
            { name: "CodeGemma 2B", filename: "codegemma-2b-Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 1580, ram: "~2.2 GB", desc: "Google DeepMind's specialized code infilling model.", url: "https://huggingface.co/bartowski/codegemma-2b-GGUF/resolve/main/codegemma-2b-Q4_K_M.gguf" },
            { name: "Granite 3B Code", filename: "granite-3b-code-instruct-Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 2050, ram: "~2.8 GB", desc: "IBM enterprise model for shell scripting & APIs.", url: "https://huggingface.co/bartowski/granite-3b-code-instruct-GGUF/resolve/main/granite-3b-code-instruct-Q4_K_M.gguf" },
            { name: "Granite 1B Code", filename: "granite-1b-code-instruct-Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 850, ram: "~1.3 GB", desc: "Lightweight tool for bash & regex automation.", url: "https://huggingface.co/bartowski/granite-1b-code-instruct-GGUF/resolve/main/granite-1b-code-instruct-Q4_K_M.gguf" },
            { name: "Stable Code 3B", filename: "stable-code-3b-Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 1890, ram: "~2.6 GB", desc: "Stability AI's low-latency auto-complete engine.", url: "https://huggingface.co/second-state/stable-code-3b-GGUF/resolve/main/stable-code-3b-Q4_K_M.gguf" },
            { name: "Magicoder 7B S-CL", filename: "magicoder-s-cl-7b-q4_k_m.gguf", quant: "Q4_K_M", sizeMb: 4300, ram: "~5.2 GB", desc: "Synthetic coding instruction tuned 7B heavyweight.", url: "https://huggingface.co/TheBloke/Magicoder-S-CL-7B-GGUF/resolve/main/magicoder-s-cl-7b.Q4_K_M.gguf" }
        ],
        unfiltered: [
            { name: "Llama 3.2 1B Uncensored", filename: "Llama-3.2-1B-Uncensored-Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 810, ram: "~1.4 GB", desc: "De-aligned weights for unbiased, candid answers.", url: "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf" },
            { name: "Llama 3.2 3B Abliterated", filename: "Llama-3.2-3B-Abliterated-Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 2050, ram: "~2.8 GB", desc: "Refusal directions surgically removed via abliteration.", url: "https://huggingface.co/failspy/Llama-3.2-3B-Instruct-abliterated-GGUF/resolve/main/Llama-3.2-3B-Instruct-abliterated.Q4_K_M.gguf" },
            { name: "Qwen 2.5 1.5B Uncensored", filename: "qwen2.5-1.5b-uncensored-q4_k_m.gguf", quant: "Q4_K_M", sizeMb: 990, ram: "~1.6 GB", desc: "Free from moralizing refusals and safety disclaimers.", url: "https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf" },
            { name: "Dolphin 2.9.4 Llama 3.2 1B", filename: "dolphin-2.9.4-llama3.2-1b-Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 820, ram: "~1.4 GB", desc: "Eric Hartford's uncensored open assistant dataset.", url: "https://huggingface.co/cognitivecomputations/dolphin-2.9.4-llama3.2-1b-gguf/resolve/main/dolphin-2.9.4-llama3.2-1b-Q4_K_M.gguf" },
            { name: "Dolphin 2.9.4 Llama 3.2 3B", filename: "dolphin-2.9.4-llama3.2-3b-Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 2040, ram: "~2.8 GB", desc: "Full autonomy and high compliance with complex queries.", url: "https://huggingface.co/cognitivecomputations/dolphin-2.9.4-llama3.2-3b-gguf/resolve/main/dolphin-2.9.4-llama3.2-3b-Q4_K_M.gguf" },
            { name: "SmolLM2 1.7B Uncensored", filename: "smollm2-1.7b-uncensored-q4_k_m.gguf", quant: "Q4_K_M", sizeMb: 1100, ram: "~1.8 GB", desc: "Compact uncensored agent with raw prompt compliance.", url: "https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/resolve/main/smollm2-1.7b-instruct-q4_k_m.gguf" },
            { name: "Gemma 2 2B Abliterated", filename: "gemma-2-2b-abliterated-Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 1610, ram: "~2.3 GB", desc: "Unrestricted creative writing & unfiltered answers.", url: "https://huggingface.co/failspy/gemma-2-2b-it-abliterated-GGUF/resolve/main/gemma-2-2b-it-abliterated.Q4_K_M.gguf" },
            { name: "TinyLlama 1.1B Uncensored", filename: "tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 670, ram: "~1.1 GB", desc: "Original unfiltered compact baseline for edge.", url: "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf" },
            { name: "Danube2 1.8B Uncensored", filename: "danube2-1.8b-chat-q4_k_m.gguf", quant: "Q4_K_M", sizeMb: 1210, ram: "~1.9 GB", desc: "Low-guardrail conversational model for privacy tests.", url: "https://huggingface.co/h2oai/h2o-danube2-1.8b-chat-GGUF/resolve/main/h2o-danube2-1.8b-chat-Q4_K_M.gguf" },
            { name: "WestLake 7B v2", filename: "westlake-7b-v2.Q4_K_M.gguf", quant: "Q4_K_M", sizeMb: 4350, ram: "~5.3 GB", desc: "High parameter unconstrained model for flagship phones.", url: "https://huggingface.co/TheBloke/WestLake-7B-v2-GGUF/resolve/main/westlake-7b-v2.Q4_K_M.gguf" }
        ]
    };

    // DOM Elements
    const elIslandStatus = document.getElementById("islandStatus");
    const elMessages = document.getElementById("messages");
    const elPrompt = document.getElementById("prompt");
    const elModelList = document.getElementById("modelList");
    const elSavedMsg = document.getElementById("savedMsg");
    const elComposer = document.getElementById("composer");
    const elSendBtn = document.getElementById("sendBtn");
    const elActiveModelTag = document.getElementById("activeModelTag");
    const elBtnInputMenu = document.getElementById("btnInputMenu");
    const elCategoryLabel = document.getElementById("categoryLabel");
    const elModelSearch = document.getElementById("modelSearch");
    const elHistorySearch = document.getElementById("historySearch");

    // Switches
    const swMarkdown = document.getElementById("switchMarkdown");
    const swHighlight = document.getElementById("switchHighlight");
    const swHistory = document.getElementById("switchHistory");
    const swHaptic = document.getElementById("switchHaptic");

    // Sidebar
    const elSidebar = document.getElementById("sidebar");
    const elSidebarScrim = document.getElementById("sidebarScrim");
    const elBtnCloseSidebar = document.getElementById("btnCloseSidebar");
    const elBtnNewChat = document.getElementById("btnNewChat");
    const elHistoryList = document.getElementById("historyList");
    const elSidebarModel = document.getElementById("sidebarModel");
    const elBtnClearAppCache = document.getElementById("btnClearAppCache");

    // SVGs
    const ICON_SEND = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
    const ICON_STOP = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"></rect></svg>`;
    const ICON_COPY = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
    const ICON_CHECK = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    const ICON_REGEN = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>`;
    const ICON_SHARE = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>`;
    const ICON_EDIT = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
    const ICON_DOTS = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>`;
    const ICON_TRASH = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

    if (elSendBtn) elSendBtn.innerHTML = ICON_SEND;

    // Theme Management (Dark / Light / System)
    function applyTheme(theme) {
        document.querySelectorAll(".xl-theme-btn").forEach(b => {
            b.classList.toggle("active", b.getAttribute("data-theme") === theme);
        });

        if (theme === "system") {
            const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
            document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
        } else {
            document.documentElement.setAttribute("data-theme", theme);
        }
        localStorage.setItem(STORAGE_THEME, theme);
    }

    const savedTheme = localStorage.getItem(STORAGE_THEME) || "dark";
    applyTheme(savedTheme);

    if (window.matchMedia) {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
            if (localStorage.getItem(STORAGE_THEME) === "system") {
                applyTheme("system");
            }
        });
    }

    document.querySelectorAll(".xl-theme-btn").forEach(btn => {
        btn.onclick = function() {
            applyTheme(this.getAttribute("data-theme"));
        };
    });

    // Configure Marked
    if (typeof marked !== "undefined") {
        marked.setOptions({
            gfm: true,
            breaks: true,
            highlight: function(code, lang) {
                if (optHighlight && typeof hljs !== "undefined") {
                    const validLang = lang && hljs.getLanguage(lang) ? lang : "plaintext";
                    return hljs.highlight(code, { language: validLang }).value;
                }
                return code;
            }
        });
    }

    // Sidebar
    function openSidebar() {
        renderSidebarHistory();
        if (elSidebar) elSidebar.hidden = false;
        if (elSidebarScrim) elSidebarScrim.hidden = false;
    }

    function closeSidebar() {
        if (elSidebar) elSidebar.hidden = true;
        if (elSidebarScrim) elSidebarScrim.hidden = true;
        closeAllHistoryMenus();
    }

    function closeAllHistoryMenus() {
        document.querySelectorAll(".xl-history-menu").forEach(m => m.remove());
    }

    if (elBtnInputMenu) elBtnInputMenu.onclick = openSidebar;
    if (elBtnCloseSidebar) elBtnCloseSidebar.onclick = closeSidebar;
    if (elSidebarScrim) elSidebarScrim.onclick = closeSidebar;

    if (elHistorySearch) {
        elHistorySearch.oninput = (e) => {
            historySearchQuery = e.target.value.toLowerCase().trim();
            renderSidebarHistory();
        };
    }

    if (elModelSearch) {
        elModelSearch.oninput = (e) => {
            modelSearchQuery = e.target.value.toLowerCase().trim();
            renderModels();
        };
    }

    // Sessions Management
    function loadSessions() {
        try {
            const raw = localStorage.getItem(STORAGE_SESSIONS);
            sessions = raw ? JSON.parse(raw) : [];
        } catch (e) { sessions = []; }

        if (sessions.length === 0) {
            createNewSession();
        } else {
            currentSessionId = sessions[0].id;
            renderCurrentSession();
        }
    }

    function saveSessions() {
        if (!optHistory) return;
        try { localStorage.setItem(STORAGE_SESSIONS, JSON.stringify(sessions)); } catch (e) {}
    }

    function getActiveSession() {
        return sessions.find(s => s.id === currentSessionId);
    }

    function createNewSession() {
        const newSession = { id: Date.now(), title: "New Chat", messages: [] };
        sessions.unshift(newSession);
        currentSessionId = newSession.id;
        saveSessions();
        renderCurrentSession();
        closeSidebar();
    }

    if (elBtnNewChat) elBtnNewChat.onclick = createNewSession;

    function deleteSession(id) {
        sessions = sessions.filter(s => s.id !== id);
        if (sessions.length === 0) {
            createNewSession();
        } else {
            if (currentSessionId === id) {
                currentSessionId = sessions[0].id;
                renderCurrentSession();
            }
            saveSessions();
            renderSidebarHistory();
        }
    }

    function renderSidebarHistory() {
        if (!elHistoryList) return;
        elHistoryList.innerHTML = "";
        closeAllHistoryMenus();

        let filtered = sessions;
        if (historySearchQuery) {
            filtered = sessions.filter(s => {
                const titleMatch = (s.title || "").toLowerCase().includes(historySearchQuery);
                const msgMatch = (s.messages || []).some(m => (m.text || "").toLowerCase().includes(historySearchQuery));
                return titleMatch || msgMatch;
            });
        }

        if (filtered.length === 0) {
            elHistoryList.innerHTML = `<div class="p-3 text-muted small text-center">${historySearchQuery ? "No matching chats" : "No saved chats"}</div>`;
            return;
        }

        filtered.forEach(sess => {
            const item = document.createElement("div");
            item.className = "xl-history-item" + (sess.id === currentSessionId ? " active" : "");

            const titleSpan = document.createElement("span");
            titleSpan.className = "xl-history-text";
            titleSpan.textContent = sess.title || "Untitled Chat";
            titleSpan.onclick = () => {
                currentSessionId = sess.id;
                renderCurrentSession();
                switchTab("chat");
                closeSidebar();
            };

            const btnMore = document.createElement("button");
            btnMore.type = "button";
            btnMore.className = "xl-history-more-btn";
            btnMore.innerHTML = ICON_DOTS;
            btnMore.onclick = (e) => {
                e.stopPropagation();
                const existing = item.querySelector(".xl-history-menu");
                if (existing) { existing.remove(); return; }
                closeAllHistoryMenus();

                const menu = document.createElement("div");
                menu.className = "xl-history-menu";

                const btnDel = document.createElement("button");
                btnDel.type = "button";
                btnDel.className = "xl-history-menu-item";
                btnDel.innerHTML = ICON_TRASH + `<span>Delete</span>`;
                btnDel.onclick = (ev) => {
                    ev.stopPropagation();
                    deleteSession(sess.id);
                };

                menu.appendChild(btnDel);
                item.appendChild(menu);
            };

            item.appendChild(titleSpan);
            item.appendChild(btnMore);
            elHistoryList.appendChild(item);
        });
    }

    function renderCurrentSession() {
        elMessages.innerHTML = "";
        const sess = getActiveSession();

        if (!sess || !sess.messages || sess.messages.length === 0) {
            elMessages.innerHTML = `
              <div class="xl-welcome">
                <div class="xl-badges-container">
                  <span class="xl-welcome-badge brand">XenonAI</span>
                  <span class="xl-welcome-badge edge">Edge Intelligence</span>
                  <span class="xl-welcome-badge secure">100% Offline / Private</span>
                </div>
                <h3>How can I assist you today?</h3>
                <p>Running high-performance offline inference locally on mobile silicon via llama.cpp.</p>
              </div>`;
            return;
        }

        sess.messages.forEach((msg, idx) => {
            const isLast = (idx === sess.messages.length - 1) || (idx === sess.messages.length - 2);
            renderMessageWrapper(msg.role, msg.text, isLast);
        });
    }

    // Tabs
    function switchTab(name) {
        currentTab = name;
        document.querySelectorAll(".xl-view").forEach(v => v.classList.remove("active"));
        document.querySelectorAll(".xl-nav-tab").forEach(t => t.classList.remove("active"));

        const targetView = document.getElementById("view-" + name);
        if (targetView) targetView.classList.add("active");

        const targetTab = document.querySelector(`.xl-nav-tab[data-tab="${name}"]`);
        if (targetTab) targetTab.classList.add("active");

        if (name === "models") renderModels();
    }

    document.querySelectorAll(".xl-nav-tab").forEach(tab => {
        tab.onclick = function() { switchTab(this.getAttribute("data-tab")); };
    });

    document.querySelectorAll(".xl-cat-chip").forEach(chip => {
        chip.onclick = function() {
            document.querySelectorAll(".xl-cat-chip").forEach(c => c.classList.remove("active"));
            this.classList.add("active");
            activeCategory = this.getAttribute("data-category");
            renderModels();
        };
    });

    const Xenon = window.Xenon || {
        isModelDownloaded: () => false,
        modelPath: (f) => f,
        loadModelDetailed: () => "OK",
        downloadModel: () => {},
        setActiveModel: () => {},
        getActiveModel: () => "",
        getSettings: () => "{}",
        saveSettings: () => {},
        generateStream: () => {},
        stopGeneration: () => {},
        copyToClipboard: (t) => { navigator.clipboard?.writeText(t); },
        shareText: () => {}
    };

    // Sliders
    const sThreads = document.getElementById("sThreads"), oThreads = document.getElementById("oThreads");
    const sCtx = document.getElementById("sCtx"), oCtx = document.getElementById("oCtx");
    const sMax = document.getElementById("sMax"), oMax = document.getElementById("oMax");
    const sTemp = document.getElementById("sTemp"), oTemp = document.getElementById("oTemp");
    const sTopP = document.getElementById("sTopP"), oTopP = document.getElementById("oTopP");
    const sTopK = document.getElementById("sTopK"), oTopK = document.getElementById("oTopK");
    const sRep = document.getElementById("sRep"), oRep = document.getElementById("oRep");
    const sSystem = document.getElementById("sSystem");

    if (sThreads) sThreads.oninput = () => { oThreads.textContent = sThreads.value; };
    if (sCtx) sCtx.oninput = () => { oCtx.textContent = sCtx.value; };
    if (sMax) sMax.oninput = () => { oMax.textContent = sMax.value; };
    if (sTemp) sTemp.oninput = () => { oTemp.textContent = (sTemp.value / 100).toFixed(2); };
    if (sTopP) sTopP.oninput = () => { oTopP.textContent = (sTopP.value / 100).toFixed(2); };
    if (sTopK) sTopK.oninput = () => { oTopK.textContent = sTopK.value; };
    if (sRep) sRep.oninput = () => { oRep.textContent = (sRep.value / 100).toFixed(2); };

    // Presets
    function setPresetValues(maxT, temp, topP, topK, rep) {
        if (sMax) { sMax.value = maxT; oMax.textContent = maxT; }
        if (sTemp) { sTemp.value = Math.round(temp * 100); oTemp.textContent = temp.toFixed(2); }
        if (sTopP) { sTopP.value = Math.round(topP * 100); oTopP.textContent = topP.toFixed(2); }
        if (sTopK) { sTopK.value = topK; oTopK.textContent = topK; }
        if (sRep) { sRep.value = Math.round(rep * 100); oRep.textContent = rep.toFixed(2); }
    }

    function selectPreset(btn, maxT, temp, topP, topK, rep) {
        document.querySelectorAll(".xl-preset-btn").forEach(b => b.classList.remove("active"));
        if (btn) btn.classList.add("active");
        setPresetValues(maxT, temp, topP, topK, rep);
    }

    const pFast = document.getElementById("presetFast");
    if (pFast) pFast.onclick = function() { selectPreset(this, 128, 0.30, 0.85, 20, 1.15); };
    const pBal = document.getElementById("presetBalanced");
    if (pBal) pBal.onclick = function() { selectPreset(this, 256, 0.70, 0.95, 40, 1.10); };
    const pCrea = document.getElementById("presetCreative");
    if (pCrea) pCrea.onclick = function() { selectPreset(this, 512, 0.90, 0.98, 60, 1.05); };
    const pCode = document.getElementById("presetCoding");
    if (pCode) pCode.onclick = function() { selectPreset(this, 384, 0.20, 0.90, 30, 1.12); };

    function loadSettings() {
        let cfg = {};
        try {
            const raw = localStorage.getItem(STORAGE_SETTINGS);
            cfg = raw ? JSON.parse(raw) : JSON.parse(Xenon.getSettings() || "{}");
        } catch (e) { cfg = {}; }

        if (sThreads) { sThreads.value = cfg.n_threads || 4; oThreads.textContent = sThreads.value; }
        if (sCtx) { sCtx.value = cfg.n_ctx || 512; oCtx.textContent = sCtx.value; }
        if (sMax) { sMax.value = cfg.maxTokens || 256; oMax.textContent = sMax.value; }
        if (sTemp) { sTemp.value = Math.round((cfg.temperature || 0.7) * 100); oTemp.textContent = (cfg.temperature || 0.7).toFixed(2); }
        if (sTopP) { sTopP.value = Math.round((cfg.topP || 0.95) * 100); oTopP.textContent = (cfg.topP || 0.95).toFixed(2); }
        if (sTopK) { sTopK.value = cfg.topK || 40; oTopK.textContent = sTopK.value; }
        if (sRep) { sRep.value = Math.round((cfg.repeatPenalty || 1.1) * 100); oRep.textContent = (cfg.repeatPenalty || 1.1).toFixed(2); }
        if (sSystem) { sSystem.value = cfg.system || "You are XenonAI, an intelligent edge assistant."; }

        // Switch settings
        if (swMarkdown) { swMarkdown.checked = cfg.optMarkdown !== false; optMarkdown = swMarkdown.checked; }
        if (swHighlight) { swHighlight.checked = cfg.optHighlight !== false; optHighlight = swHighlight.checked; }
        if (swHistory) { swHistory.checked = cfg.optHistory !== false; optHistory = swHistory.checked; }
        if (swHaptic) { swHaptic.checked = cfg.optHaptic === true; optHaptic = swHaptic.checked; }

        if (swMarkdown) swMarkdown.onchange = () => { optMarkdown = swMarkdown.checked; };
        if (swHighlight) swHighlight.onchange = () => { optHighlight = swHighlight.checked; };
        if (swHistory) swHistory.onchange = () => { optHistory = swHistory.checked; };
        if (swHaptic) swHaptic.onchange = () => { optHaptic = swHaptic.checked; };
    }

    const saveBtn = document.getElementById("save");
    if (saveBtn) {
        saveBtn.onclick = function() {
            const cfg = {
                n_threads: parseInt(sThreads.value, 10),
                n_ctx: parseInt(sCtx.value, 10),
                maxTokens: parseInt(sMax.value, 10),
                temperature: parseFloat(sTemp.value) / 100,
                topP: parseFloat(sTopP.value) / 100,
                topK: parseInt(sTopK.value, 10),
                repeatPenalty: parseFloat(sRep.value) / 100,
                system: sSystem.value,
                optMarkdown: swMarkdown ? swMarkdown.checked : true,
                optHighlight: swHighlight ? swHighlight.checked : true,
                optHistory: swHistory ? swHistory.checked : true,
                optHaptic: swHaptic ? swHaptic.checked : false
            };

            try {
                localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(cfg));
                Xenon.saveSettings(cfg.maxTokens, cfg.temperature, cfg.topP, cfg.topK, cfg.system);
            } catch (e) {}

            if (elSavedMsg) {
                elSavedMsg.textContent = "Configuration saved successfully";
                setTimeout(() => { elSavedMsg.textContent = ""; }, 2500);
            }
        };
    }

    if (elBtnClearAppCache) {
        elBtnClearAppCache.onclick = () => {
            if (confirm("Reset local settings and active model state?")) {
                localStorage.removeItem(STORAGE_SETTINGS);
                loadSettings();
                alert("Settings reset to defaults.");
            }
        };
    }

    // Models Rendering
    function renderModels() {
        if (!elModelList) return;
        elModelList.innerHTML = "";

        const categoryTitles = {
            general: "General Purpose",
            reasoning: "Reasoning & STEM",
            coding: "Coding & Software",
            unfiltered: "Unfiltered / Uncensored"
        };

        const activeModelName = Xenon.getActiveModel ? Xenon.getActiveModel() : "";
        if (elActiveModelTag) {
            elActiveModelTag.textContent = activeModelName ? activeModelName.replace(".gguf", "") : "Active: None";
        }

        let models = MODEL_CATALOG[activeCategory] || [];
        if (modelSearchQuery) {
            models = models.filter(m => 
                m.name.toLowerCase().includes(modelSearchQuery) ||
                m.filename.toLowerCase().includes(modelSearchQuery) ||
                m.desc.toLowerCase().includes(modelSearchQuery) ||
                m.quant.toLowerCase().includes(modelSearchQuery)
            );
        }

        if (elCategoryLabel) {
            elCategoryLabel.textContent = `${categoryTitles[activeCategory] || "Models"} (${models.length})`;
        }

        if (models.length === 0) {
            elModelList.innerHTML = `<div class="p-4 text-center text-muted small">No models matching "${modelSearchQuery}"</div>`;
            return;
        }

        models.forEach(m => {
            const card = document.createElement("div");
            const isDownloaded = Xenon.isModelDownloaded ? Xenon.isModelDownloaded(m.filename) : false;
            const isActive = activeModelName === m.filename;

            card.className = "xl-model-card" + (isActive ? " active-model" : "");
            card.id = "card-" + m.filename.replace(/[^a-zA-Z0-9_-]/g, "_");

            let actionHtml = "";
            if (isActive) {
                actionHtml = `<button type="button" class="btn btn-secondary w-100" style="opacity: 0.85;" disabled>✓ Running</button>`;
            } else if (isDownloaded) {
                actionHtml = `<button type="button" class="btn btn-primary w-100 btn-load">Load Model</button>`;
            } else {
                actionHtml = `<button type="button" class="btn btn-outline-info w-100 btn-dl">Download (~${m.sizeMb} MB)</button>`;
            }

            card.innerHTML = `
                <div class="xl-model-header">
                    <div>
                        <div class="xl-model-title">${m.name}</div>
                        <div class="text-muted" style="font-family: var(--font-mono); font-size: 11px; margin-top: 2px;">${m.filename}</div>
                    </div>
                    ${isActive ? '<span class="xl-model-badge-active"><span class="xl-island-dot"></span> Active</span>' : ''}
                </div>
                <div class="xl-model-meta-row">
                    <span class="xl-pill highlight">${m.quant}</span>
                    <span class="xl-pill">${m.sizeMb} MB</span>
                    <span class="xl-pill">RAM ${m.ram}</span>
                    <span class="xl-pill">${activeCategory.toUpperCase()}</span>
                </div>
                <p style="font-size: 12.5px; color: var(--text-muted); margin-bottom: 12px; line-height: 1.4;">${m.desc}</p>
                <div class="xl-action-container">${actionHtml}</div>
                <div class="xl-dl-progress-box" style="display: none;">
                    <div class="xl-dl-bar-track"><div class="xl-dl-bar-fill"></div></div>
                    <div class="xl-dl-text-row">
                        <span class="dl-status">Downloading...</span>
                        <span class="dl-stats">0%</span>
                    </div>
                </div>
            `;

            const loadBtn = card.querySelector(".btn-load");
            if (loadBtn) {
                loadBtn.onclick = function() {
                    const path = Xenon.modelPath(m.filename);
                    if (elIslandStatus) elIslandStatus.textContent = "Loading...";

                    setTimeout(() => {
                        const status = Xenon.loadModelDetailed ? Xenon.loadModelDetailed(path) : "OK";
                        if (status === "OK") {
                            Xenon.setActiveModel(m.filename);
                            if (elIslandStatus) elIslandStatus.textContent = "Ready";
                            if (elSidebarModel) elSidebarModel.textContent = m.filename;
                            renderModels();
                            switchTab("chat");
                        } else {
                            if (elIslandStatus) elIslandStatus.textContent = "Load failed";
                            alert("Diagnostic Error:\nPath: " + path + "\nDetails: " + status);
                        }
                    }, 50);
                };
            }

            const dlBtn = card.querySelector(".btn-dl");
            if (dlBtn) {
                dlBtn.onclick = function() {
                    dlBtn.disabled = true;
                    dlBtn.textContent = "Connecting...";
                    const progressBox = card.querySelector(".xl-dl-progress-box");
                    if (progressBox) progressBox.style.display = "block";

                    if (Xenon.downloadModel) {
                        Xenon.downloadModel(m.url, m.filename);
                    }
                };
            }

            elModelList.appendChild(card);
        });
    }

    window.__xenonDownloadProgress = function(filename, percent, speedMb, dlMb, totMb) {
        const safeId = "card-" + filename.replace(/[^a-zA-Z0-9_-]/g, "_");
        const card = document.getElementById(safeId);
        if (!card) return;

        const progressBox = card.querySelector(".xl-dl-progress-box");
        if (progressBox) progressBox.style.display = "block";

        const barFill = card.querySelector(".xl-dl-bar-fill");
        if (barFill) barFill.style.width = percent + "%";

        const statsText = card.querySelector(".dl-stats");
        if (statsText) statsText.textContent = `${percent}% (${speedMb} MB/s)`;

        const statusText = card.querySelector(".dl-status");
        if (statusText) statusText.textContent = `${dlMb} / ${totMb} MB`;
    };

    window.__xenonDownloadDone = function(filename) { renderModels(); };
    window.__xenonDownloadError = function(filename, err) {
        alert("Download failed for " + filename + ": " + err);
        renderModels();
    };

    const btnBrowse = document.getElementById("btnBrowse");
    if (btnBrowse) {
        btnBrowse.onclick = () => { if (window.Xenon && Xenon.openFilePicker) Xenon.openFilePicker(); };
    }

    // Action Bars
    function createBotActionBar(text) {
        const bar = document.createElement("div");
        bar.className = "xl-action-bar bot";

        const btnCopy = document.createElement("button");
        btnCopy.type = "button";
        btnCopy.className = "xl-action-btn";
        btnCopy.innerHTML = ICON_COPY + `<span>Copy</span>`;
        btnCopy.onclick = () => {
            if (Xenon.copyToClipboard) Xenon.copyToClipboard(text);
            btnCopy.innerHTML = ICON_CHECK + `<span>Copied</span>`;
            setTimeout(() => { btnCopy.innerHTML = ICON_COPY + `<span>Copy</span>`; }, 2000);
        };

        const btnRegen = document.createElement("button");
        btnRegen.type = "button";
        btnRegen.className = "xl-action-btn";
        btnRegen.innerHTML = ICON_REGEN + `<span>Retry</span>`;
        btnRegen.onclick = () => {
            if (lastUserPrompt && !isGenerating) regenerateInPlace(lastUserPrompt);
        };

        const btnShare = document.createElement("button");
        btnShare.type = "button";
        btnShare.className = "xl-action-btn";
        btnShare.innerHTML = ICON_SHARE + `<span>Share</span>`;
        btnShare.onclick = () => {
            if (Xenon.shareText) Xenon.shareText(text);
        };

        bar.appendChild(btnCopy);
        bar.appendChild(btnRegen);
        bar.appendChild(btnShare);
        return bar;
    }

    function createUserActionBar(bubble, wrapper) {
        document.querySelectorAll(".xl-action-bar.user").forEach(b => b.remove());

        const bar = document.createElement("div");
        bar.className = "xl-action-bar user";

        const btnEdit = document.createElement("button");
        btnEdit.type = "button";
        btnEdit.className = "xl-action-btn";
        btnEdit.innerHTML = ICON_EDIT + `<span>Edit</span>`;

        btnEdit.onclick = () => {
            if (isGenerating) return;
            const originalText = bubble.textContent.trim();
            bubble.style.display = "none";
            bar.style.display = "none";

            const editBox = document.createElement("div");
            editBox.className = "xl-edit-box";

            const ta = document.createElement("textarea");
            ta.className = "xl-edit-textarea";
            ta.value = originalText;

            const actions = document.createElement("div");
            actions.className = "xl-edit-actions";

            const btnCancel = document.createElement("button");
            btnCancel.type = "button";
            btnCancel.className = "btn btn-secondary";
            btnCancel.textContent = "Cancel";
            btnCancel.onclick = () => {
                editBox.remove();
                bubble.style.display = "";
                bar.style.display = "";
            };

            const btnSave = document.createElement("button");
            btnSave.type = "button";
            btnSave.className = "btn btn-primary";
            btnSave.textContent = "Submit";
            btnSave.onclick = () => {
                const newPrompt = ta.value.trim();
                if (!newPrompt) return;
                editBox.remove();
                bubble.textContent = newPrompt;
                bubble.style.display = "";
                bar.style.display = "";
                lastUserPrompt = newPrompt;

                const sess = getActiveSession();
                if (sess && sess.messages.length >= 2) {
                    sess.messages[sess.messages.length - 2].text = newPrompt;
                    saveSessions();
                }

                regenerateInPlace(newPrompt);
            };

            actions.appendChild(btnCancel);
            actions.appendChild(btnSave);
            editBox.appendChild(ta);
            editBox.appendChild(actions);

            wrapper.appendChild(editBox);
            ta.focus();
        };

        bar.appendChild(btnEdit);
        return bar;
    }

    function renderMessageWrapper(role, text, isLast) {
        const wrapper = document.createElement("div");
        wrapper.className = "xl-msg-wrapper " + role;

        const bubble = document.createElement("div");
        bubble.className = "xl-msg " + role;

        if (role === "user") {
            bubble.textContent = text;
            wrapper.appendChild(bubble);
            if (isLast) {
                lastUserPrompt = text;
                wrapper.appendChild(createUserActionBar(bubble, wrapper));
            }
        } else {
            bubble.innerHTML = (optMarkdown && typeof marked !== "undefined") ? marked.parse(text) : text;
            wrapper.appendChild(bubble);
            if (isLast) {
                lastBotWrapper = wrapper;
                lastBotBubble = bubble;
                wrapper.appendChild(createBotActionBar(text));
            }
        }

        elMessages.appendChild(wrapper);
        elMessages.scrollTop = elMessages.scrollHeight;
        return { wrapper, bubble };
    }

    function appendMsg(role, text) {
        const welcome = document.querySelector(".xl-welcome");
        if (welcome) welcome.remove();
        return renderMessageWrapper(role, text, true);
    }

    function setGeneratingState(generating) {
        isGenerating = generating;
        if (!elSendBtn) return;
        if (generating) {
            elSendBtn.innerHTML = ICON_STOP;
            elSendBtn.classList.add("btn-stop");
        } else {
            elSendBtn.innerHTML = ICON_SEND;
            elSendBtn.classList.remove("btn-stop");
        }
    }

    function startGeneration(text) {
        const reqId = callbackSeq++;
        startTime = Date.now();
        setGeneratingState(true);
        if (elIslandStatus) elIslandStatus.textContent = "Generating...";

        let maxT = parseInt(sMax.value, 10);
        let temp = parseFloat(sTemp.value) / 100;
        let topP = parseFloat(sTopP.value) / 100;
        let topK = parseInt(sTopK.value, 10);

        if (window.Xenon && Xenon.generateStream) {
            Xenon.generateStream(text, maxT, temp, topP, topK, reqId);
        }
    }

    function triggerPrompt(text) {
        lastUserPrompt = text;

        const sess = getActiveSession();
        if (sess) {
            if (sess.messages.length === 0) {
                sess.title = text.slice(0, 26) + (text.length > 26 ? "..." : "");
            }
            sess.messages.push({ role: "user", text: text });
            saveSessions();
        }

        appendMsg("user", text);

        rawBotBuffer = "";
        const botNodes = appendMsg("bot", "...");
        window.__activeBotBubble = botNodes.bubble;
        window.__activeBotWrapper = botNodes.wrapper;
        lastBotBubble = botNodes.bubble;
        lastBotWrapper = botNodes.wrapper;

        startGeneration(text);
    }

    function regenerateInPlace(promptText) {
        if (!lastBotBubble || !lastBotWrapper) {
            triggerPrompt(promptText);
            return;
        }

        const existingBar = lastBotWrapper.querySelector(".xl-action-bar.bot");
        if (existingBar) existingBar.remove();

        rawBotBuffer = "";
        lastBotBubble.textContent = "...";
        window.__activeBotBubble = lastBotBubble;
        window.__activeBotWrapper = lastBotWrapper;

        startGeneration(promptText);
    }

    if (elComposer) {
        elComposer.onsubmit = function(e) {
            e.preventDefault();

            if (isGenerating) {
                if (window.Xenon && Xenon.stopGeneration) Xenon.stopGeneration();
                setGeneratingState(false);
                if (elIslandStatus) elIslandStatus.textContent = "Stopped";
                return;
            }

            const text = elPrompt.value.trim();
            if (!text) return;

            elPrompt.value = "";
            triggerPrompt(text);
        };
    }

    window.__xenonSetStatus = function(txt) {
        if (elIslandStatus) elIslandStatus.textContent = txt;
    };

    window.__xenonOnModelReady = function(name) {
        if (elIslandStatus) elIslandStatus.textContent = "Ready";
        if (elSidebarModel) elSidebarModel.textContent = name;
        renderModels();
        switchTab("chat");
    };

    let tokenAccumulator = 0;
    window.__xenonToken = function(id, text) {
        if (!window.__activeBotBubble) return;

        rawBotBuffer += text;
        tokenAccumulator++;

        if (optMarkdown && typeof marked !== "undefined") {
            window.__activeBotBubble.innerHTML = marked.parse(rawBotBuffer);
        } else {
            window.__activeBotBubble.textContent = rawBotBuffer;
        }

        elMessages.scrollTop = elMessages.scrollHeight;

        const elapsedSec = (Date.now() - startTime) / 1000;
        if (elapsedSec > 0.5 && elIslandStatus) {
            const spd = (tokenAccumulator / elapsedSec).toFixed(1);
            elIslandStatus.textContent = spd + " t/s";
        }
    };

    window.__xenonDone = function(id) {
        tokenAccumulator = 0;
        setGeneratingState(false);

        if (optHighlight && window.__activeBotBubble && typeof hljs !== "undefined") {
            window.__activeBotBubble.querySelectorAll("pre code").forEach(block => {
                hljs.highlightElement(block);
            });
        }

        const sess = getActiveSession();
        if (sess && rawBotBuffer) {
            if (sess.messages.length > 0 && sess.messages[sess.messages.length - 1].role === "bot") {
                sess.messages[sess.messages.length - 1].text = rawBotBuffer;
            } else {
                sess.messages.push({ role: "bot", text: rawBotBuffer });
            }
            saveSessions();
        }

        if (window.__activeBotWrapper && !window.__activeBotWrapper.querySelector(".xl-action-bar.bot")) {
            const actions = createBotActionBar(rawBotBuffer);
            window.__activeBotWrapper.appendChild(actions);
            elMessages.scrollTop = elMessages.scrollHeight;
        }

        if (optHaptic && navigator.vibrate) {
            try { navigator.vibrate(40); } catch(e) {}
        }

        if (elIslandStatus) elIslandStatus.textContent = "Ready";
    };

    // Boot
    loadSettings();
    loadSessions();
    renderModels();
})();
