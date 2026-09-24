/** Locally served Solar artwork, tinted by the current appearance. */
export function MusicBackdrop() {
  return <div className="music-backdrop" aria-hidden="true">
    <i className="music-mark music-mark--notes" /><i className="music-mark music-mark--stars" />
    <i className="music-mark music-mark--wave" /><i className="music-mark music-mark--spark" />
    <span className="music-backdrop-orbit" />
  </div>;
}
