"use client";

import { Brush, Eraser, Highlighter, PenLine, Undo2 } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

type Props = { disabled?: boolean; value: string; onChange: (value: string) => void };
const PAPER_COLOR = "#f4efe3";

export function SketchPad({ disabled = false, value, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPainted = useRef<string | null>(null);
  const hasDrawing = !!value;
  const history = useRef<string[]>(value ? [value] : []);
  const [color, setColor] = useState("#263b47");
  const [width, setWidth] = useState(12);
  const [tool, setTool] = useState<"pen" | "marker" | "eraser">("pen");
  const colors = ["#263b47", "#d0634d", "#d89b3f", "#4e8b78", "#627bb2", "#9c6fae"];
  const widths = [{ label: "细", value: 7 }, { label: "中", value: 14 }, { label: "粗", value: 25 }];
  function paper(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    context.save(); context.globalCompositeOperation = "source-over"; context.globalAlpha = 1; context.fillStyle = PAPER_COLOR; context.fillRect(0, 0, canvas.width, canvas.height); context.restore();
  }
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    if (lastPainted.current === value) return;
    if (!value) { context.clearRect(0, 0, canvas.width, canvas.height); paper(context, canvas); lastPainted.current = ""; return; }
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      context.save(); context.globalCompositeOperation = "source-over"; context.globalAlpha = 1;
      context.clearRect(0, 0, canvas.width, canvas.height); paper(context, canvas);
      context.drawImage(image, 0, 0, canvas.width, canvas.height); context.restore();
      lastPainted.current = value;
    };
    image.src = value;
    return () => { active = false; };
  }, [value]);
  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  }
  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const p = point(event); context.globalCompositeOperation = "source-over"; context.strokeStyle = tool === "eraser" ? PAPER_COLOR : color; context.globalAlpha = tool === "marker" ? .42 : 1; context.lineWidth = tool === "marker" ? Math.max(width, 22) : width; context.beginPath(); context.moveTo(p.x, p.y); drawing.current = true;
  }
  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const p = point(event); context.lineTo(p.x, p.y); context.stroke();
  }
  function finish() {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas) { const snapshot = canvas.toDataURL("image/jpeg", .82); lastPainted.current = snapshot; history.current = [...history.current.slice(-7), snapshot]; onChange(snapshot); }
  }
  function clear() {
    if (disabled) return;
    const canvas = canvasRef.current, context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height); paper(context, canvas); lastPainted.current = ""; history.current = []; onChange("");
  }
  function undo() {
    if (disabled || !history.current.length) return;
    history.current = history.current.slice(0, -1); const previous = history.current.at(-1) ?? ""; onChange(previous);
    if (!previous) { const canvas = canvasRef.current, context = canvas?.getContext("2d"); if (canvas && context) { context.clearRect(0, 0, canvas.width, canvas.height); paper(context, canvas); lastPainted.current = ""; } }
  }
  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    context.lineCap = "round"; context.lineJoin = "round"; context.lineWidth = 12; context.strokeStyle = "#263b47";
  }, []);
  return <div className="tp-sketch-pad">
    <div className="tp-sketch-toolbar"><span><PenLine size={15} aria-hidden="true" />画一笔</span><div className="tp-sketch-tools"><button type="button" aria-label="画笔" aria-pressed={tool === "pen"} onClick={() => setTool("pen")} disabled={disabled}><Brush size={14} aria-hidden="true" /></button><button type="button" aria-label="荧光笔" aria-pressed={tool === "marker"} onClick={() => setTool("marker")} disabled={disabled}><Highlighter size={14} aria-hidden="true" /></button><button type="button" aria-label="橡皮擦" aria-pressed={tool === "eraser"} onClick={() => setTool("eraser")} disabled={disabled}><Eraser size={14} aria-hidden="true" /></button><button type="button" aria-label="撤销" onClick={undo} disabled={disabled || !hasDrawing}><Undo2 size={14} aria-hidden="true" /></button><button type="button" className="tp-sketch-clear" onClick={clear} disabled={disabled || !hasDrawing}>清空</button></div></div>
    <div className="tp-sketch-options"><div className="tp-sketch-colors" role="group" aria-label="笔色">{colors.map(item => <button key={item} type="button" aria-label={`选择颜色 ${item}`} aria-pressed={color === item} onClick={() => { setColor(item); setTool("pen"); }} disabled={disabled} style={{ "--sketch-color": item } as CSSProperties} />)}</div><div className="tp-sketch-widths" role="group" aria-label="笔触粗细">{widths.map(item => <button key={item.value} type="button" aria-label={`${item.label}笔触`} aria-pressed={width === item.value} onClick={() => setWidth(item.value)} disabled={disabled}>{item.label}</button>)}</div></div>
    <canvas ref={canvasRef} width={512} height={512} aria-label="手绘留言画布" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} />
  </div>;
}
