import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity as ActivityIcon,
  ArrowDownToLine,
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  FolderOpen,
  Leaf,
  LoaderCircle,
  Menu,
  MessageCircle,
  Moon,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { api, type Activity, type AIStatus, type Preview, type Rule } from "./api";

type Page = "Dashboard" | "File Organizer" | "Daily Digest" | "Focus Mode" | "Automation Rules" | "Settings";
const navigation: { name: Page; icon: typeof Leaf }[] = [
  { name: "Dashboard", icon: ActivityIcon },
  { name: "File Organizer", icon: FolderOpen },
  { name: "Daily Digest", icon: FileText },
  { name: "Focus Mode", icon: Moon },
  { name: "Automation Rules", icon: Zap },
  { name: "Settings", icon: Settings },
];

function App() {
  const [page, setPage] = useState<Page>("Dashboard");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [health, setHealth] = useState<AIStatus | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [status, log, savedRules] = await Promise.all([api.health(), api.activity(), api.rules()]);
      setHealth(status.ai);
      setActivities(log);
      setRules(savedRules);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not load LazyFlow." });
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const showError = (error: unknown) =>
    setNotice({ kind: "error", text: error instanceof Error ? error.message : "Something went wrong." });
  const doUndo = async (id: number) => {
    setBusy(true);
    try {
      const result = await api.undo(id);
      setNotice({ kind: "success", text: `Restored ${result.restored} file${result.restored === 1 ? "" : "s"}.` });
      await refresh();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const choosePage = (next: Page) => {
    setPage(next);
    setMobileMenu(false);
    setNotice(null);
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {mobileMenu && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileMenu(false)} />}
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Leaf size={19} strokeWidth={2.2} /></div>
          <span>lazyflow<span className="brand-ai">.ai</span></span>
          <button className="sidebar-close" aria-label="Close navigation" onClick={() => setMobileMenu(false)}><X size={19} /></button>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation" className="nav-list">
          {navigation.map(({ name, icon: Icon }) => (
            <button key={name} onClick={() => choosePage(name)} className={`nav-item ${page === name ? "nav-active" : ""}`}>
              <Icon size={18} strokeWidth={1.8} /><span>{name}</span>
              {page === name && <ChevronRight className="nav-chevron" size={15} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-note">
            <ShieldCheck size={18} />
            <div><strong>Your data stays yours</strong><span>Local-first by design</span></div>
          </div>
          <button className="profile-row" onClick={() => choosePage("Settings")}>
            <div className="avatar">L</div>
            <div className="profile-name"><strong>Local workspace</strong><span>Personal</span></div>
            <Settings size={16} className="profile-settings" />
          </button>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <button className="mobile-menu-button" aria-label="Open navigation" onClick={() => setMobileMenu(true)}><Menu size={21} /></button>
          <div className="breadcrumbs">Workspace <span>/</span> <strong>{page}</strong></div>
          <div className="topbar-right">
            <div className="offline-pill"><span className="status-dot" />Offline tools ready</div>
            <div className={`ai-pill ${health?.model_installed ? "ai-connected" : ""}`}><span className="ai-dot" />{health?.model_installed ? "Local AI connected" : "AI not connected"}</div>
          </div>
        </header>
        <section className="page-content">
          {notice && (
            <div role="status" className={`notice ${notice.kind === "error" ? "notice-error" : "notice-success"}`}>
              {notice.kind === "error" ? <CircleHelp size={17} /> : <Check size={17} />}
              <span>{notice.text}</span>
              <button aria-label="Dismiss" onClick={() => setNotice(null)}><X size={16} /></button>
            </div>
          )}
          {page === "Dashboard" && <Dashboard health={health} activities={activities} setPage={choosePage} busy={busy} onUndo={doUndo} showError={showError} onRefresh={refresh} />}
          {page === "File Organizer" && <Organizer showError={showError} setNotice={setNotice} onRefresh={refresh} />}
          {page === "Daily Digest" && <Digest showError={showError} setNotice={setNotice} />}
          {page === "Focus Mode" && <Focus showError={showError} />}
          {page === "Automation Rules" && <Rules rules={rules} setRules={setRules} showError={showError} setNotice={setNotice} />}
          {page === "Settings" && <SettingsPage health={health} onRefresh={refresh} showError={showError} />}
        </section>
        <footer className="page-footer">
          <span><ShieldCheck size={14} /> Private by default</span><span>Made for a slower, steadier workflow</span>
        </footer>
      </main>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function Dashboard({ health, activities, setPage, busy, onUndo, showError, onRefresh }: {
  health: AIStatus | null; activities: Activity[]; setPage: (page: Page) => void; busy: boolean;
  onUndo: (id: number) => void; showError: (error: unknown) => void; onRefresh: () => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const ask = async (event: FormEvent) => {
    event.preventDefault();
    if (!message.trim()) return;
    setChatBusy(true);
    setReply("");
    try {
      const result = await api.chat(message.trim());
      setReply(result.reply);
      setMessage("");
      await onRefresh();
    } catch (error) { showError(error); }
    finally { setChatBusy(false); }
  };
  return <>
    <div className="welcome-row">
      <div><div className="eyebrow">YOUR PRIVATE WORKSPACE</div><h1>Good things take <em>their time.</em></h1><p>A little less busywork. A little more room to think.</p></div>
      <div className="date-card"><div className="date-icon"><Clock3 size={17} /></div><span>Today</span><strong>{new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(new Date())}</strong></div>
    </div>
    <div className="status-banner">
      <div className="status-banner-icon"><Bot size={20} /></div>
      <div className="status-banner-copy"><strong>{health?.model_installed ? "Your local AI is ready" : "Your workspace is ready for you"}</strong><span>{health?.message ?? "Checking local services…"}</span></div>
      <span className={`connection-label ${health?.model_installed ? "connection-online" : ""}`}><span />{health?.model_installed ? "Connected" : "Offline ready"}</span>
    </div>
    {!health?.model_installed && <div className="setup-hint"><Sparkles size={15} /><span>To enable local AI, install Ollama and run <code>ollama pull llama3.2:3b</code>. Your offline tools work right now.</span><button onClick={() => setPage("Settings")}>Setup guide <ArrowRight size={14} /></button></div>}
    <div className="section-heading"><div><h2>Make space for what matters</h2><p>Pick up where you need a hand.</p></div></div>
    <div className="quick-grid">
      <QuickCard icon={<FolderOpen size={20} />} tone="green" title="Tidy your files" text="Preview a calmer, more organized folder." action="Open organizer" onClick={() => setPage("File Organizer")} />
      <QuickCard icon={<FileText size={20} />} tone="peach" title="Find the gist" text="Turn a wall of text into the essentials." action="Create a digest" onClick={() => setPage("Daily Digest")} />
      <QuickCard icon={<Moon size={20} />} tone="lavender" title="Take a breath" text="A small reset for your next moment." action="Open focus mode" onClick={() => setPage("Focus Mode")} />
    </div>
    <div className="dashboard-lower">
      <div className="card activity-card">
        <div className="card-heading"><div><h2>Recent activity</h2><p>A quiet record of what LazyFlow did.</p></div><button className="icon-button" title="Refresh activity" onClick={() => void onRefresh()}><RefreshCw size={16} /></button></div>
        <ActivityList activities={activities.slice(0, 4)} busy={busy} onUndo={onUndo} />
        {activities.length > 4 && <button className="text-link" onClick={() => setPage("Settings")}>View full activity <ArrowRight size={14} /></button>}
      </div>
      <div className="card chat-card">
        <div className="card-heading"><div className="chat-heading-icon"><MessageCircle size={17} /></div><div><h2>A thought, untangled</h2><p>Ask your local model, privately.</p></div></div>
        {reply && <div className="chat-reply"><span>LAZYFLOW</span><p>{reply}</p></div>}
        <form className="chat-form" onSubmit={ask}><label className="sr-only" htmlFor="chat-prompt">Ask LazyFlow</label><input id="chat-prompt" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="What’s on your mind?" maxLength={100000} /><button disabled={chatBusy || !health?.model_installed} aria-label="Send message">{chatBusy ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}</button></form>
        {!health?.model_installed && <span className="chat-offline">Connect Ollama to start a private chat.</span>}
        <div className="chat-privacy"><ShieldCheck size={13} /> Conversations go only to your local model.</div>
      </div>
    </div>
    <div className="offline-strip"><WifiOff size={15} /><span><strong>Works without internet.</strong> File tools, focus exercises, rules, and basic summaries run locally.</span><button onClick={() => setPage("Settings")}>How it works <ArrowRight size={14} /></button></div>
  </>;
}

function QuickCard({ icon, tone, title, text, action, onClick }: { icon: ReactNode; tone: string; title: string; text: string; action: string; onClick: () => void }) {
  return <button className="quick-card" onClick={onClick}><div className={`quick-icon ${tone}`}>{icon}</div><h3>{title}</h3><p>{text}</p><span>{action}<ArrowRight size={14} /></span></button>;
}

function ActivityList({ activities, busy, onUndo }: { activities: Activity[]; busy: boolean; onUndo: (id: number) => void }) {
  if (!activities.length) return <div className="empty-state"><div className="empty-icon"><ActivityIcon size={19} /></div><strong>A fresh start</strong><span>Your activity will appear here as you use LazyFlow.</span></div>;
  return <div className="activity-list">{activities.map((item) => (
    <div className="activity-item" key={item.id}><div className="activity-bullet"><Check size={13} /></div><div className="activity-copy"><strong>{item.action}</strong><span>{item.summary}</span><time>{new Date(`${item.created_at.replace(" ", "T")}Z`).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time></div>
      {item.undoable && <button className="undo-button" onClick={() => onUndo(item.id)} disabled={busy} title="Undo this file organization"><Undo2 size={15} /><span>Undo</span></button>}
    </div>
  ))}</div>;
}

function Organizer({ showError, setNotice, onRefresh }: { showError: (error: unknown) => void; setNotice: (notice: { kind: "error" | "success"; text: string } | null) => void; onRefresh: () => Promise<void> }) {
  const [root, setRoot] = useState("");
  const [mode, setMode] = useState("type");
  const [extension, setExtension] = useState(".png");
  const [category, setCategory] = useState("Screenshots");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const createPreview = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setPreview(null); setNotice(null);
    try {
      setPreview(await api.preview(root.trim(), mode, mode === "custom" ? { [extension]: category } : undefined));
    } catch (error) { showError(error); }
    finally { setLoading(false); }
  };
  const confirm = async () => {
    if (!preview) return;
    setConfirming(true);
    try {
      const result = await api.confirm(preview.preview_id);
      setPreview(null);
      setNotice({ kind: "success", text: `Done. Moved ${result.moved} file${result.moved === 1 ? "" : "s"}. You can undo this from Recent activity.` });
      await onRefresh();
    } catch (error) { showError(error); }
    finally { setConfirming(false); }
  };
  return <>
    <PageHeading eyebrow="A TIDIER SPACE" title="File organizer" description="Sort a folder on your computer. Review every move before anything changes." />
    <div className="organizer-layout">
      <div className="card organizer-form-card">
        <div className="form-section-title"><div className="number-badge">1</div><div><h2>Choose a folder</h2><p>Use the full path to a folder on this computer.</p></div></div>
        <form onSubmit={createPreview}>
          <label htmlFor="folder-path">Folder path</label><input id="folder-path" className="text-input" value={root} onChange={(event) => setRoot(event.target.value)} required placeholder="/Users/you/Downloads or C:\Users\you\Downloads" maxLength={4096} />
          <div className="field-help"><ShieldCheck size={14} /> LazyFlow only reads and changes files inside the folder you choose.</div>
          <label htmlFor="sort-mode" className="label-spaced">Organize by</label>
          <select className="text-input" id="sort-mode" value={mode} onChange={(event) => setMode(event.target.value)}><option value="type">File type</option><option value="date">Modified date (year-month)</option><option value="custom">Custom category</option><option value="rules">My automation rules</option></select>
          {mode === "custom" && <div className="custom-fields"><div><label htmlFor="file-extension">File extension</label><input id="file-extension" className="text-input" value={extension} onChange={(event) => setExtension(event.target.value)} placeholder=".png" /></div><div><label htmlFor="custom-folder">Destination folder</label><input id="custom-folder" className="text-input" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Screenshots" /></div></div>}
          <button className="primary-button full-button" disabled={loading || !root.trim()}>{loading ? <><LoaderCircle size={17} className="spin" /> Scanning folder…</> : <><Sparkles size={16} /> Preview organization</>}</button>
        </form>
        <div className="safety-note"><ShieldCheck size={17} /><div><strong>Nothing moves yet.</strong><span>Hidden folders and symbolic links are skipped. You confirm the complete preview first.</span></div></div>
      </div>
      <div className="card preview-card">
        <div className="card-heading"><div><h2>Preview</h2><p>Proposed changes, before they happen.</p></div><div className="preview-mark"><FolderOpen size={18} /></div></div>
        {!preview ? <div className="preview-empty"><div className="preview-empty-art"><div><FolderOpen size={25} /></div><span><i /><i /><i /></span></div><strong>Your preview will appear here</strong><p>Choose a folder and a sorting style to see the suggested moves.</p></div> :
          <><div className="preview-summary"><div><span>FILES TO MOVE</span><strong>{preview.count}</strong></div><div><span>SELECTED FOLDER</span><strong className="path-value" title={preview.root}>{preview.root}</strong></div></div>
            {preview.moves.length ? <div className="move-list">{preview.moves.slice(0, 40).map((move) => <div className="move-row" key={`${move.source}:${move.destination}`}><span className="move-file"><FileText size={14} />{move.source}</span><ArrowRight size={14} /><span className="move-dest">{move.destination}</span></div>)}</div> : <div className="no-moves"><Check size={16} /> This folder is already organized. No changes needed.</div>}
            {preview.moves.length > 40 && <p className="truncated-note">Showing 40 of {preview.count} proposed moves.</p>}
            {preview.count > 0 && <button className="primary-button full-button" onClick={() => setConfirming(true)}><Check size={16} /> Review and confirm {preview.count} moves</button>}
          </>}
      </div>
    </div>
    <div className="tip-box"><Sparkles size={17} /><span><strong>Slow and steady:</strong> Start with a small test folder. Existing files are never overwritten, and each move can be undone from your activity log.</span></div>
    {confirming && preview && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirming(false); }}><section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><div className="modal-icon"><ShieldCheck size={23} /></div><button className="modal-close" aria-label="Close dialog" onClick={() => setConfirming(false)}><X size={18} /></button><h2 id="confirm-title">Ready to tidy up?</h2><p>This will move <strong>{preview.count} files</strong> inside <code>{preview.root}</code>. No files will be deleted or overwritten.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setConfirming(false)} disabled={confirming}>Not yet</button><button className="primary-button" onClick={() => void confirm()} disabled={confirming}>{confirming ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} Yes, organize files</button></div></section></div>}
  </>;
}

function Digest({ showError, setNotice }: { showError: (error: unknown) => void; setNotice: (notice: { kind: "error" | "success"; text: string } | null) => void }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"digest" | "summary">("digest");
  const [result, setResult] = useState<{ summary: string; tasks?: string[]; source: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const processFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) { showError(new Error("Please choose a text file smaller than 1 MB.")); event.target.value = ""; return; }
    try { setText(await file.text()); setResult(null); }
    catch { showError(new Error("Could not read this file. Try a plain text file instead.")); }
    event.target.value = "";
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setNotice(null); setResult(null);
    try {
      setResult(kind === "digest" ? await api.digest(text.trim()) : await api.summarize(text.trim()));
    } catch (error) { showError(error); }
    finally { setLoading(false); }
  };
  return <>
    <PageHeading eyebrow="CLEAR THE MENTAL DESK" title="Daily digest" description="Paste notes, a conversation, or a long text file. Get the gist and the next steps." />
    <div className="digest-layout">
      <div className="card digest-input-card">
        <div className="toggle-tabs" role="tablist" aria-label="Text tool">
          <button role="tab" aria-selected={kind === "digest"} className={kind === "digest" ? "tab-active" : ""} onClick={() => { setKind("digest"); setResult(null); }}>Daily digest</button>
          <button role="tab" aria-selected={kind === "summary"} className={kind === "summary" ? "tab-active" : ""} onClick={() => { setKind("summary"); setResult(null); }}>Quick summary</button>
        </div>
        <form onSubmit={submit}><label htmlFor="digest-text">{kind === "digest" ? "What happened today?" : "What would you like to summarize?"}</label>
          <textarea id="digest-text" className="text-area" value={text} onChange={(event) => setText(event.target.value)} placeholder={"Paste notes, meeting highlights, or a conversation here…\n\nTip: add action items as bullets or with [ ] checkboxes."} maxLength={100000} required />
          <div className="input-meta"><span>{text.length.toLocaleString()} / 100,000 characters</span><label className="file-upload"><ArrowDownToLine size={15} /> Load a .txt file<input type="file" accept=".txt,.md,.log,text/plain,text/markdown" onChange={(event) => void processFile(event)} /></label></div>
          <button className="primary-button full-button" disabled={loading || !text.trim()}>{loading ? <><LoaderCircle className="spin" size={17} /> Finding the signal…</> : <><Sparkles size={16} /> {kind === "digest" ? "Create my digest" : "Summarize this text"}</>}</button>
        </form>
        <p className="privacy-caption"><ShieldCheck size={14} /> Your text is processed locally by Ollama when available, with an offline fallback.</p>
      </div>
      <div className="card digest-result-card"><div className="card-heading"><div><h2>{result ? "Here’s the short version" : "Your clarity, right here"}</h2><p>{result ? result.source === "local-ai" ? "Created with your local model." : "Created with the offline summarizer." : "The summary and useful next steps will appear here."}</p></div><div className="digest-sparkle"><Sparkles size={18} /></div></div>
        {result ? <div className="result-content"><div className="result-summary">{result.summary}</div>{result.tasks && <div className="task-list"><h3><Check size={15} /> Things to remember</h3>{result.tasks.length ? result.tasks.map((task, index) => <div className="task-row" key={`${task}-${index}`}><span className="task-check" />{task}</div>) : <div className="no-tasks">No explicit action items found. That’s okay.</div>}</div>}</div> : <div className="result-empty"><div className="result-art"><Sparkles size={23} /></div><strong>Less to hold in your head</strong><p>We’ll keep it concise and won’t invent details that aren’t in your text.</p></div>}
      </div>
    </div>
    <div className="tip-box"><ShieldCheck size={17} /><span><strong>Private by default:</strong> This text never leaves your computer. Without Ollama, LazyFlow uses a basic offline extractive summary.</span></div>
  </>;
}

function Focus({ showError }: { showError: (error: unknown) => void }) {
  const [exercise, setExercise] = useState<{ title: string; routine: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const reset = async () => { setLoading(true); try { setExercise(await api.focus()); } catch (error) { showError(error); } finally { setLoading(false); } };
  return <>
    <PageHeading eyebrow="A MOMENT FOR YOU" title="Focus mode" description="A little reset. No streaks, timers, or pressure to do it perfectly." />
    <div className="focus-stage"><div className="focus-orbit orbit-one" /><div className="focus-orbit orbit-two" /><div className="focus-center"><div className="focus-leaf"><Leaf size={28} /></div><span>TAKE IT SLOW</span><h2>{exercise?.title ?? "Arrive in this moment."}</h2><p>{exercise?.routine ?? "There is nowhere else you need to be for the next few seconds. Take a comfortable breath, and let your shoulders soften."}</p><button className="primary-button" onClick={() => void reset()} disabled={loading}>{loading ? <LoaderCircle size={17} className="spin" /> : <RefreshCw size={16} />}{exercise ? "Another gentle reset" : "Give me a small reset"}</button></div></div>
    <div className="focus-note"><ShieldCheck size={16} /><span>These gentle exercises are suggestions, not medical advice. Skip anything that doesn’t feel comfortable.</span></div>
  </>;
}

function Rules({ rules, setRules, showError, setNotice }: { rules: Rule[]; setRules: (rules: Rule[]) => void; showError: (error: unknown) => void; setNotice: (notice: { kind: "error" | "success"; text: string } | null) => void }) {
  const [name, setName] = useState("");
  const [extensions, setExtensions] = useState("");
  const [folder, setFolder] = useState("");
  const [loading, setLoading] = useState(false);
  const add = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true);
    try {
      const rule = await api.addRule({ name: name.trim(), extensions: extensions.split(",").map((item) => item.trim()).filter(Boolean), folder: folder.trim() });
      setRules([...rules, rule]); setName(""); setExtensions(""); setFolder("");
      setNotice({ kind: "success", text: "Rule saved. It will be included when you preview organization by automation rules." });
    } catch (error) { showError(error); }
    finally { setLoading(false); }
  };
  const remove = async (id: number) => {
    try { await api.deleteRule(id); setRules(rules.filter((item) => item.id !== id)); }
    catch (error) { showError(error); }
  };
  return <>
    <PageHeading eyebrow="LET THE LITTLE THINGS SORT THEMSELVES" title="Automation rules" description="Simple, predictable rules for the folders you choose. Nothing runs in the background." />
    <div className="rules-layout">
      <div className="card rule-create-card"><div className="card-heading"><div><h2>Create a rule</h2><p>Rules only run when you preview and confirm a folder organization.</p></div><div className="rule-icon"><Zap size={18} /></div></div>
        <form onSubmit={add}><label htmlFor="rule-name">Rule name</label><input id="rule-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} placeholder="Screenshots to captures" />
          <label htmlFor="rule-ext" className="label-spaced">Extensions <span className="label-subtle">comma separated</span></label><input id="rule-ext" className="text-input" value={extensions} onChange={(event) => setExtensions(event.target.value)} required placeholder=".png, jpg" />
          <label htmlFor="rule-folder" className="label-spaced">Destination folder</label><input id="rule-folder" className="text-input" value={folder} onChange={(event) => setFolder(event.target.value)} required maxLength={64} placeholder="Screenshots" />
          <button className="primary-button full-button" disabled={loading || !name.trim() || !extensions.trim() || !folder.trim()}>{loading ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} Save this rule</button>
        </form>
      </div>
      <div className="card saved-rules-card"><div className="card-heading"><div><h2>Your saved rules</h2><p>Stored on this computer. No automatic file changes.</p></div><span className="rule-count">{rules.length}</span></div>
        {!rules.length ? <div className="empty-state rule-empty"><div className="empty-icon"><Zap size={19} /></div><strong>Nothing automated, yet</strong><span>Create a rule to make sorting a little easier.</span></div> : <div className="saved-rule-list">{rules.map((rule) => <div className="saved-rule" key={rule.id}><div className="saved-rule-icon"><FolderOpen size={17} /></div><div className="saved-rule-content"><strong>{rule.name}</strong><span>{rule.extensions.join(", ")} <ArrowRight size={12} /> {rule.folder}/</span></div><button className="icon-button delete-rule" aria-label={`Delete ${rule.name}`} onClick={() => void remove(rule.id)}><Trash2 size={16} /></button></div>)}</div>}
        <div className="rule-footnote"><ShieldCheck size={15} /> Rules are suggestions only; review each move before confirming.</div>
      </div>
    </div>
  </>;
}

function SettingsPage({ health, onRefresh, showError }: { health: AIStatus | null; onRefresh: () => Promise<void>; showError: (error: unknown) => void }) {
  const [checking, setChecking] = useState(false);
  const check = async () => { setChecking(true); try { await onRefresh(); } catch (error) { showError(error); } finally { setChecking(false); } };
  return <>
    <PageHeading eyebrow="YOUR WORKSPACE, YOUR RULES" title="Settings & privacy" description="Understand how LazyFlow works, and set up your local AI when you’re ready." />
    <div className="settings-grid">
      <div className="card settings-card"><div className="settings-card-head"><div className="settings-icon"><Bot size={20} /></div><div><h2>Local AI connection</h2><p>LazyFlow connects only to Ollama on this computer.</p></div></div>
        <div className={`settings-status ${health?.model_installed ? "settings-ready" : "settings-offline"}`}><span className="status-dot" /><div><strong>{health?.model_installed ? "Ready to use" : health?.available ? "Ollama is running, model not found" : "Ollama not connected"}</strong><span>{health?.message ?? "Checking Ollama…"}</span></div><button className="secondary-button" onClick={() => void check()} disabled={checking}>{checking ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />} Check again</button></div>
        <div className="setup-steps"><h3>Set up Ollama</h3><ol><li>Install Ollama from <a href="https://ollama.com/download" target="_blank" rel="noreferrer">ollama.com/download <ArrowRight size={12} /></a>.</li><li>Open a terminal and download the default model: <code>ollama pull llama3.2:3b</code></li><li>Keep Ollama running. LazyFlow checks it on <code>127.0.0.1:11434</code>.</li></ol><p>Default model: <code>{health?.model ?? "llama3.2:3b"}</code>. Override with <code>OLLAMA_MODEL</code>.</p></div>
      </div>
      <div className="card privacy-card"><div className="settings-card-head"><div className="settings-icon privacy-icon"><ShieldCheck size={20} /></div><div><h2>Privacy, without the fine print</h2><p>Built to be useful without sending your files away.</p></div></div><div className="privacy-points"><PrivacyPoint title="No automatic uploads" text="Files stay in the folder you select. The browser never sends file contents to a cloud service." /><PrivacyPoint title="Local AI only" text="Text sent to AI features goes to your local Ollama service, never to a hosted model API." /><PrivacyPoint title="Your confirmation first" text="File moves require a preview and a separate confirmation. Nothing is deleted." /><PrivacyPoint title="Offline by default" text="File organizing, rules, activity, focus prompts, and basic summaries work without internet." /></div></div>
      <div className="card settings-card wide-card"><div className="settings-card-head"><div className="settings-icon"><ActivityIcon size={19} /></div><div><h2>Where your data lives</h2><p>Local settings and activity stored in a private SQLite database.</p></div></div><div className="storage-path"><code>~/.lazyflow-ai/lazyflow.sqlite3</code><span>Override with <code>LAZYFLOW_DB_PATH</code>. Activity stores only action descriptions and undo data for file moves.</span></div></div>
    </div>
  </>;
}

function PrivacyPoint({ title, text }: { title: string; text: string }) {
  return <div className="privacy-point"><div><Check size={13} /></div><span><strong>{title}</strong><small>{text}</small></span></div>;
}

export default App;
