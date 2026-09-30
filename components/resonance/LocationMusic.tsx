"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Headphones, Heart, Image as ImageIcon, Mailbox, MapPin, PenLine, RefreshCw, Sparkles, Stamp, StickyNote, Type, Volume2, X } from "lucide-react";
import { audioTracks } from "@/lib/resonance/demo-data";
import type { PlaceCommand, PlaceContentType, PlaceNote } from "@/lib/resonance/place-protocol";
import type { AudioTrack } from "@/lib/resonance/types";
import { accountHeaders, type HostSession } from "@/lib/resonance/host-protocol";
import { placeCopyStyleLabel, placeCopyStyles, type PlaceCopyStyle, type PlaceCopySuggestion } from "@/lib/resonance/place-copy";
import { usePlaceMusic } from "@/hooks/usePlaceMusic";
import { useHost } from "./HostProvider";
import { AlbumTile } from "./AlbumTile";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { coverThemeStyle } from "@/lib/resonance/cover-theme";
import { SketchPad } from "./SketchPad";
import { startImageJob, subscribeImageJob, type ClientImageJobState } from "@/lib/resonance/image-job-client";

type Props = { experience: "demo" | "online"; currentTrackId?: string | null; onPlayTrack: (track: AudioTrack) => void; onPauseMusic: () => void };
export function LocationMusic(props: Props) {
  const { session } = useHost();
  return session ? <PlaceWall key={`${session.accountId}.${props.experience}`} {...props} session={session} /> : null;
}
function PlaceWall({ session, experience, currentTrackId, onPlayTrack, onPauseMusic }: Props & { session: HostSession }) {
  const host = useHost(), wall = usePlaceMusic(session, experience);
  const [trackId, setTrackId] = useState(currentTrackId ?? audioTracks[0]?.id ?? "");
  const [title, setTitle] = useState("留给路过的你"), [message, setMessage] = useState("");
  const [contentType, setContentType] = useState<PlaceContentType>("text");
  const [drawingData, setDrawingData] = useState(""), [aiImageData, setAiImageData] = useState("");
  const [imageBusy, setImageBusy] = useState(false), [imageNotice, setImageNotice] = useState("");
  const [feedback, setFeedback] = useState(""), [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState<string | null>(null), [reading, setReading] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [copyStyle, setCopyStyle] = useState<PlaceCopyStyle>("gentle");
  const [copySuggestions, setCopySuggestions] = useState<PlaceCopySuggestion[]>([]);
  const [copyBusy, setCopyBusy] = useState(false), [copyNotice, setCopyNotice] = useState("");
  const [copyOpen, setCopyOpen] = useState(false), [copyIndex, setCopyIndex] = useState(0);
  const [copySource, setCopySource] = useState<"ai" | "template">("template");
  const copyController = useRef<AbortController | null>(null);
  const suggestion = copySuggestions[copyIndex];
  const selectedTrack = audioTracks.find(track => track.id === trackId);
  const titleInput = useRef<HTMLInputElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const disabled = wall.busy || !!wall.pending || !wall.ready;
  const placeName = wall.data.places.find(place => place.id === wall.data.placeId)?.name ?? "附近";
  const [postmark] = useState(() => { const today = new Date(); return `${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`; });
  const imageJobKey = `${session.accountId}:${trackId}:${title.trim()}`;
  useEffect(() => () => { if (utterance.current) window.speechSynthesis?.cancel(); copyController.current?.abort(); copyController.current = null; }, []);
  useEffect(() => subscribeImageJob(imageJobKey, (state: ClientImageJobState) => {
    setImageBusy(state.status === "running"); setAiImageData(state.imageUrl ?? ""); setImageNotice(state.notice ?? "");
  }), [imageJobKey]);
  function cancelCopy() {
    copyController.current?.abort(); copyController.current = null; setCopyBusy(false);
  }
  function resetCopy() {
    cancelCopy(); setCopySuggestions([]); setCopyIndex(0); setCopyNotice("");
  }
  function chooseContentType(next: PlaceContentType) {
    setContentType(next); setImageNotice("");
    if (next !== "drawing") setDrawingData("");
    if (next !== "ai") setAiImageData("");
    if (next !== "text") { setMessage(""); resetCopy(); }
  }
  function cancelImage() { /* Background image jobs intentionally continue across view changes. */ }
  function resetContent() { cancelImage(); setContentType("text"); setDrawingData(""); setAiImageData(""); setImageNotice(""); }
  function stopReading() { if (utterance.current) window.speechSynthesis?.cancel(); utterance.current = null; setReading(null); }
  function read(note: PlaceNote) {
    setSaveError("");
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) { setSaveError("当前浏览器不支持朗读，可以直接阅读留言。"); return; }
    if (note.contentType !== "text") return;
    if (reading === note.id) { stopReading(); return; }
    stopReading(); onPauseMusic();
    const speech = new SpeechSynthesisUtterance(`${note.title}。${note.message}`); speech.lang = "zh-CN";
    speech.onend = () => { if (utterance.current === speech) { utterance.current = null; setReading(null); } };
    speech.onerror = event => { if (utterance.current === speech) { utterance.current = null; setReading(null); if (event.error !== "canceled" && event.error !== "interrupted") setSaveError("朗读暂时不可用，可以直接阅读留言。"); } };
    utterance.current = speech; setReading(note.id); window.speechSynthesis.speak(speech);
  }
  async function run(command: PlaceCommand) {
    if (disabled) return;
    setFeedback(""); const result = await wall.act(command);
    if (!result) return;
    if (command.action === "leave") { setMessage(""); resetCopy(); resetContent(); setCopyOpen(false); setComposing(false); setFeedback("已留在这个地点，后来的人也能听见"); }
    if (command.action === "withdraw") setFeedback("已收回这条留言");
  }
  async function refreshSongs() {
    stopReading(); setFeedback("");
    if (await wall.refresh()) setFeedback("附近的歌曲已更新");
  }
  async function retry() {
    const action = wall.pending?.action;
    if (await wall.retry() && action === "leave") { setMessage(""); resetCopy(); resetContent(); setCopyOpen(false); setComposing(false); setFeedback("已留在这个地点，后来的人也能听见"); }
  }
  async function favorite(track: AudioTrack) {
    if (saving) return;
    setSaving(track.id); setSaveError("");
    try { if (!await host.save("favorite", track.id)) setSaveError("收藏未保存，请重试"); }
    catch { setSaveError("收藏未保存，请重试"); }
    finally { setSaving(null); }
  }
  async function generateCopy() {
    if (disabled || !selectedTrack || copyBusy) return;
    const controller = new AbortController(); copyController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    setCopyBusy(true); setCopyNotice("");
    try {
      const response = await fetch("/api/ai/place-copy", { method: "POST", headers: { "Content-Type": "application/json", ...accountHeaders(session) }, body: JSON.stringify({ track: { track: selectedTrack.track, artist: selectedTrack.artist }, style: copyStyle, draft: message }), cache: "no-store", signal: controller.signal });
      const result = await response.json() as { suggestions?: PlaceCopySuggestion[]; error?: string; source?: "ai" | "template" };
      if (copyController.current !== controller) return;
      if (!response.ok || !result.suggestions?.length) throw new Error(result.error ?? "COPY_UNAVAILABLE");
      setCopySuggestions(result.suggestions); setCopyIndex(0); setCopySource(result.source ?? "template"); setCopyOpen(false);
      setCopyNotice(`有 ${result.suggestions.length} 条灵感可选`);
    } catch { if (copyController.current === controller) setCopyNotice("没生成成功，再试一次"); }
    finally { clearTimeout(timeout); if (copyController.current === controller) { copyController.current = null; setCopyBusy(false); } }
  }
  function generateImage() {
    if (disabled || !selectedTrack || imageBusy) return;
    startImageJob(imageJobKey, async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 75000);
      try {
        const response = await fetch("/api/ai/place-image", { method: "POST", headers: { "Content-Type": "application/json", ...accountHeaders(session) }, body: JSON.stringify({ track: { track: selectedTrack.track, artist: selectedTrack.artist }, title }), cache: "no-store", signal: controller.signal });
        const type = response.headers.get("content-type") ?? "";
        if (!response.ok) {
          const result = await response.json().catch(() => ({})) as { error?: string };
          const messages: Record<string, string> = { AI_AUTH_FAILED: "生图密钥无效，请检查服务配置", AI_BILLING_REQUIRED: "生图额度不足或未开通付费", AI_RATE_LIMIT: "生图服务繁忙，请稍后再试", AI_CONTENT_REJECTED: "内容安全审核未通过，请换个标题", AI_TIMEOUT: "生图等待超时，请重试", AI_UNAVAILABLE: "生图服务暂时不可用，请重试" };
          throw new Error(messages[result.error ?? ""] ?? "生图失败，请重试");
        }
        if (type.startsWith("image/")) return { imageUrl: await compressImage(await response.blob()), notice: "AI 图已生成" };
        const result = await response.json() as { imageUrl?: string; source?: "ai" | "fallback" };
        if (!result.imageUrl) throw new Error("AI 没有返回图片");
        return { imageUrl: result.imageUrl, notice: result.source === "fallback" ? "已生成演示图（模型未配置）" : "AI 图已生成" };
      } finally { clearTimeout(timeout); }
    });
  }  function applyCopy(suggestion: PlaceCopySuggestion) {
    setTitle(suggestion.title); setMessage(suggestion.message); resetCopy(); setCopyOpen(false); setCopyNotice("已采用，可继续修改");
  }
  async function compressImage(blob: Blob) {
    if (typeof createImageBitmap !== "function") return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
    const bitmap = await createImageBitmap(blob), max = 768, scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d"); if (!context) throw new Error("IMAGE_CANVAS_UNAVAILABLE");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    return canvas.toDataURL("image/jpeg", .78);
  }
  return <section className="tp-location-music" aria-labelledby="place-heading">
    <header className="tp-place-intro"><p className="login-kicker">MUSIC / HERE</p><h2 id="place-heading">把一首歌，留在这里。</h2><p>同一个地方，听见不同人的歌。</p></header>
    <Dialog open={composing} onOpenChange={open => { setComposing(open); if (!open) cancelCopy(); }}>
      <DialogTrigger asChild><button type="button" className="tp-place-postcard" disabled={wall.busy || (!wall.ready && !wall.pending)} aria-label="留一张声音明信片">
        <span className="tp-postcard-record" aria-hidden="true"><AlbumTile coverUrl={selectedTrack?.coverUrl} accent={selectedTrack?.accent ?? "#a8bdd8"} size="sm" /></span>
        <span className="tp-postcard-copy"><small>TO / 下一位路过的人</small><strong>留一张声音明信片</strong><span>{imageBusy ? "AI 正在画，先去逛逛吧" : aiImageData ? "AI 图已准备好，接着写吧" : message.trim() ? "草稿还在，接着写吧" : "一首歌，一句话，留在这里。"}</span></span>
        <span className="tp-postcard-stamp" aria-hidden="true"><MapPin size={14} /><span>HERE</span></span><ArrowUpRight className="tp-postcard-arrow" size={20} aria-hidden="true" />
      </button></DialogTrigger>
      <DialogContent showCloseButton={false} className="cover-scope tp-place-composer" style={coverThemeStyle(selectedTrack)} onOpenAutoFocus={event => { event.preventDefault(); closeButton.current?.focus(); }}>
        <header className="tp-composer-heading">
          <DialogTitle><small aria-hidden="true">POST CARD</small>声音明信片</DialogTitle>
          <DialogDescription className="tp-sr">编辑一首歌和一句话，确认后留给附近的人。收起会保留草稿。</DialogDescription>
          <DialogClose asChild><button ref={closeButton} type="button" className="tp-icon-btn" aria-label="收起声音明信片"><X size={20} aria-hidden="true" /></button></DialogClose>
        </header>
        <form className="tp-place-form tp-place-form--postcard" aria-label="留下歌曲与留言" data-sending={wall.busy} onSubmit={event => { event.preventDefault(); void run({ action: "leave", body: { id: crypto.randomUUID(), trackId, title, contentType, ...(contentType === "text" ? { message } : { imageUrl: contentType === "drawing" ? drawingData : aiImageData }) } }); }}>
          {/* 明信片的地址栏：邮票是这首歌的封面，邮戳盖着此地和今天。 */}
          <div className="tp-pc-address">
            <div className="tp-pc-to">
              <p className="tp-pc-line"><span>TO</span>下一位路过这里的人</p>
              <label className="tp-track-picker">
                <span className="tp-track-picker-caption">随信附上一首歌 · 换一首 <ChevronDown size={14} aria-hidden="true" /></span>
                <strong>{selectedTrack?.track}</strong><span className="tp-track-picker-artist">{selectedTrack?.artist}</span>
                <select aria-label="选一首歌" disabled={disabled} value={trackId} onChange={event => { setTrackId(event.target.value); resetCopy(); setImageNotice(""); }}>{audioTracks.map(track => <option key={track.id} value={track.id}>{track.track} · {track.artist}</option>)}</select>
              </label>
            </div>
            <div className="tp-pc-stamp" aria-hidden="true">
              <span className="tp-pc-stamp-paper"><AlbumTile coverUrl={selectedTrack?.coverUrl} accent={selectedTrack?.accent ?? "#a8bdd8"} size="lg" /></span>
              <span className="tp-pc-postmark"><svg viewBox="0 0 120 64"><path d="M0 14q10-6 20 0t20 0 20 0 20 0 20 0 20 0M0 26q10-6 20 0t20 0 20 0 20 0 20 0 20 0M0 38q10-6 20 0t20 0 20 0 20 0 20 0 20 0M0 50q10-6 20 0t20 0 20 0 20 0 20 0 20 0" /></svg><b><em>{placeName}</em>{postmark}</b></span>
            </div>
          </div>
          <div className="tp-postcard-editor" data-preview={!!suggestion}>
            <div className="tp-content-picker" role="group" aria-label="留言形式">{([ ["text", "写一句", Type], ["drawing", "画一笔", PenLine], ["ai", "AI 配图", ImageIcon] ] as const).map(([type, label, Icon]) => <button key={type} type="button" aria-pressed={contentType === type} disabled={disabled || copyBusy || imageBusy} onClick={() => chooseContentType(type)}><Icon size={15} aria-hidden="true" />{label}</button>)}</div>
            <div className="tp-pc-sheet" data-mode={contentType}>
              <label className="tp-postcard-title"><span className="tp-sr">留言标题</span><input ref={titleInput} id="place-message-title" required maxLength={40} disabled={disabled} value={title} onChange={event => setTitle(event.target.value)} placeholder="给这首歌一个名字" /></label>
              {contentType === "text" && (suggestion ? <div className="tp-pc-note">
                <div className="tp-inspiration-heading"><span>{copySource === "ai" ? "AI 递来一张便签" : "一张灵感便签"}</span><button type="button" disabled={disabled || copyBusy} onClick={resetCopy}>我自己写</button></div>
                <div className="tp-inspiration-content" aria-live="polite" aria-atomic="true"><h3>{suggestion.title}</h3><p>{suggestion.message}</p></div>
                <div className="tp-inspiration-controls">
                  <div className="tp-inspiration-pager"><button type="button" aria-label="上一条灵感" disabled={disabled || copyBusy} onClick={() => setCopyIndex(index => (index + copySuggestions.length - 1) % copySuggestions.length)}><ChevronLeft size={18} aria-hidden="true" /></button><span aria-label={`第 ${copyIndex + 1} 条，共 ${copySuggestions.length} 条`}>{copyIndex + 1}<i>/</i>{copySuggestions.length}</span><button type="button" aria-label="下一条灵感" disabled={disabled || copyBusy} onClick={() => setCopyIndex(index => (index + 1) % copySuggestions.length)}><ChevronRight size={18} aria-hidden="true" /></button></div>
                  <button className="tp-inspiration-apply" type="button" disabled={disabled || copyBusy} onClick={() => applyCopy(suggestion)}>抄到明信片上 <ArrowUpRight size={16} aria-hidden="true" /></button>
                </div>
              </div> : <>
                <label className="tp-postcard-message"><span className="tp-field-label">想说的话</span><textarea required maxLength={600} rows={5} disabled={disabled} value={message} onChange={event => setMessage(event.target.value)} placeholder="让这首歌，替你说一句…" /></label><span className="tp-place-caption">{message.length}/600</span>
              </>)}
              {contentType === "drawing" && <SketchPad disabled={disabled} value={drawingData} onChange={setDrawingData} />}
              {contentType === "ai" && <div className="tp-ai-image-editor"><div className={`tp-ai-image-preview${imageBusy ? " is-generating" : ""}`} aria-busy={imageBusy}>{imageBusy ? <div className="tp-ai-image-loading"><span className="tp-ai-orbit" aria-hidden="true"><i /><i /><i /></span><strong>正在画一张明信片</strong><span>关掉这张卡片也会继续生成</span></div> : aiImageData ? <img src={aiImageData} alt="AI 生成的留言图" /> : <div><ImageIcon size={26} aria-hidden="true" /><span>让 AI 根据这首歌画一张明信片正面</span></div>}</div><div className="tp-ai-image-actions"><button type="button" className="tp-ai-image-generate" disabled={disabled || imageBusy} onClick={() => void generateImage()} aria-busy={imageBusy}><Sparkles size={15} aria-hidden="true" />{imageBusy ? "生成中…" : aiImageData ? "换一张" : "生成图片"}</button>{imageNotice && <span role="status">{imageNotice}</span>}</div></div>}
            </div>
          </div>
          {contentType === "text" && !suggestion && <div className="tp-ai-copy" aria-label="AI 灵感文案" data-open={copyOpen}>
            <button type="button" className="tp-ai-copy-toggle" aria-expanded={copyOpen} aria-controls="place-copy-options" disabled={disabled} onClick={() => setCopyOpen(open => !open)}><StickyNote size={16} aria-hidden="true" />写不出来？让 AI 递张便签<ChevronDown size={14} aria-hidden="true" /></button>
            {copyOpen && <div id="place-copy-options" className="tp-ai-copy-options"><div className="tp-ai-copy-styles" role="group" aria-label="文案语气">{placeCopyStyles.map(style => <button key={style} type="button" aria-pressed={copyStyle === style} disabled={disabled || copyBusy} onClick={() => { setCopyStyle(style); resetCopy(); }}>{placeCopyStyleLabel(style)}</button>)}</div><button type="button" className="tp-ai-copy-generate" disabled={disabled || copyBusy || !selectedTrack} onClick={() => void generateCopy()} aria-busy={copyBusy}><Sparkles size={14} aria-hidden="true" />{copyBusy ? "生成中" : "生成"}</button></div>}
          </div>}
          {contentType === "text" && <p className={copyNotice.startsWith("没生成") ? "tp-ai-copy-notice" : "tp-sr"} role="status">{copyNotice}</p>}
          {wall.error && <div className="room-error" role="alert">{wall.error}<button type="button" className="tp-link" disabled={wall.busy} onClick={() => void retry()}>重试</button></div>}
          <div className="tp-composer-actions"><span><Mailbox size={14} aria-hidden="true" />寄往 · {placeName}</span><button type="submit" className="tp-btn tp-btn--primary" disabled={disabled || copyBusy || imageBusy || !!suggestion || !title.trim() || !trackId || (contentType === "text" ? !message.trim() : contentType === "drawing" ? !drawingData : !aiImageData)} aria-busy={wall.busy}><Stamp size={17} aria-hidden="true" />{wall.busy ? "盖章中…" : "盖章，留在这里"}</button></div>
        </form>
      </DialogContent>
    </Dialog>
    <header className="tp-place-wall-head"><div><h3>附近的留声</h3><p>{wall.busy ? "正在更新附近…" : wall.ready ? `500 米内 · ${wall.data.notes.length} 首歌留在这里` : "定位后，听见路过的人"}</p></div><button type="button" className="tp-place-refresh tp-link" disabled={wall.busy || !!wall.pending} aria-busy={wall.busy} onClick={() => void refreshSongs()}><RefreshCw size={16} aria-hidden="true" />{wall.busy ? "刷新中…" : "刷新歌曲"}</button></header>
    {wall.ready && !wall.data.notes.length && <div className="tp-empty"><MapPin aria-hidden="true" /><h3>附近还没有人留歌</h3><p>留下一首，让后来经过这里的人听见。</p></div>}
    {wall.ready && <>
      <div className="tp-place-notes" aria-label="附近的音乐留言">{wall.data.notes.map(note => {
        const track = audioTracks.find(item => item.id === note.trackId);
        const place = wall.data.places.find(item => item.id === note.placeId);
        return <article className="tp-sheet tp-place-note" key={note.id}><p className="tp-sheet-who">{note.mine ? "你留下的" : "一位路过的听众"} · {place?.name ?? "附近"} · {new Date(note.createdAt).toLocaleDateString("zh-CN")}</p><h3>{note.title}</h3>{note.contentType === "text" || !note.contentType ? <p className="tp-place-message">{note.message}</p> : note.imageUrl ? <div className="tp-place-note-art"><img src={note.imageUrl} alt={note.contentType === "drawing" ? "手绘留言" : "AI 生成的留言图"} /><span>{note.contentType === "drawing" ? "手绘" : "AI 图"}</span></div> : null}<div className="tp-sheet-row"><AlbumTile coverUrl={track?.coverUrl} accent={track?.accent ?? "#a8bdd8"} size="sm" /><div className="tp-sheet-meta"><strong>{track?.track ?? "歌曲已移除"}</strong><p className="tp-sheet-copy">{track?.artist}</p></div></div><div className="tp-actions"><button type="button" className="tp-btn tp-btn--primary" disabled={!track} onClick={() => { if (track) { stopReading(); onPlayTrack(track); } }}><Headphones size={16} aria-hidden="true" />听歌</button>{(note.contentType === "text" || !note.contentType) && <button type="button" className="tp-btn tp-btn--quiet" aria-pressed={reading === note.id} onClick={() => read(note)}><Volume2 size={16} aria-hidden="true" />{reading === note.id ? "停止朗读" : "听留言"}</button>}<button type="button" className="tp-link" disabled={!track || !!saving || !!track && host.data.favoriteIds.includes(track.id)} onClick={() => track && void favorite(track)}><Heart size={14} aria-hidden="true" />{track && host.data.favoriteIds.includes(track.id) ? "已收藏" : saving === track?.id ? "保存中…" : "收藏"}</button>{note.mine && <button type="button" className="tp-link" disabled={disabled} onClick={() => void run({ action: "withdraw", body: { id: note.id } })}>收回留言</button>}</div></article>;
      })}</div>
    </>}
    <p className="tp-place-feedback" role="status">{feedback || (!wall.ready && wall.busy ? "正在打开地点…" : "")}</p>
    {wall.error && !composing && <div className="room-error" role="alert">{wall.error}<button type="button" className="tp-link" disabled={wall.busy} onClick={() => void retry()}>重试这次操作</button></div>}
    {saveError && <p className="room-error" role="alert">{saveError}</p>}
  </section>;
}
