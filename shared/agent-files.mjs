// 共享的 Agent 工作区文件分类与后缀白名单，供 ai-node 与前端 lib/agent-client 复用。
// 确保上传分类、在线预览、直接编辑与附件读取始终使用同一套权威定义。

export const TEXT_EXTENSIONS = Object.freeze(
  new Set([
    "txt",
    "md",
    "markdown",
    "csv",
    "json",
    "log",
    "xml",
    "yml",
    "yaml",
    "html",
    "htm",
    "css",
    "ts",
    "tsx",
    "js",
    "jsx",
    "mjs",
    "cjs",
    "py",
    "java",
    "c",
    "h",
    "cpp",
    "hpp",
    "go",
    "rs",
    "rb",
    "sh",
    "sql",
    "ini",
    "toml",
  ]),
);

export const DOCUMENT_PREVIEW_EXTENSIONS = Object.freeze(new Set(["docx", "xlsx"]));
