import { AudioLines, Check, Heart, ListPlus, Music2, ThumbsDown, ThumbsUp } from "lucide-react";

export default function TrackCard({
  track,
  index,
  saved = false,
  onSave,
  feedbackValue,
  onFeedback,
  onPlay,
  playlists = [],
  onAddToPlaylist,
  card = false,
}) {
  const playable = Boolean(track.url);

  return (
    <article className={`track-row ${card ? "track-card" : ""}`}>
      <button
        className="track-main"
        type="button"
        onClick={() => onPlay?.(track)}
        disabled={!playable}
        aria-label={`${track.isFallback ? "Search and play" : "Play"} ${track.title} by ${track.artist}`}
      >
        <span className="track-art" aria-hidden="true">
          {track.thumbnail ? (
            <img src={track.thumbnail} alt="" loading="lazy" decoding="async"/>
          ) : (
            <span className={`fallback-art art-${index % 4}`}><Music2 size={20}/></span>
          )}
          <span className="track-index">{String(index + 1).padStart(2, "0")}</span>
          <span className="art-play"><AudioLines size={16}/></span>
        </span>
        <span className="track-info">
          <strong>{track.title}</strong>
          <span>{track.artist}</span>
          {track.reason && <span className="track-reason">{track.reason}</span>}
        </span>
      </button>
      <div className="track-actions">
        {playable && !track.isFallback && onFeedback && <>
          <button
            className={`feedback-button ${feedbackValue === "up" ? "active" : ""}`}
            onClick={() => onFeedback(track, "up")}
            aria-pressed={feedbackValue === "up"}
            title="More like this"
            aria-label={`Like ${track.title}`}
          ><ThumbsUp size={14}/></button>
          <button
            className={`feedback-button ${feedbackValue === "down" ? "active" : ""}`}
            onClick={() => onFeedback(track, "down")}
            aria-pressed={feedbackValue === "down"}
            title="Less like this"
            aria-label={`Show fewer songs like ${track.title}`}
          ><ThumbsDown size={14}/></button>
        </>}
        {playable && !track.isFallback && onSave && <button
          className={`save-button ${saved ? "is-saved" : ""}`}
          onClick={() => onSave(track)}
          aria-pressed={saved}
          title={saved ? "Saved to your collection" : "Save track"}
          aria-label={saved ? `Unsave ${track.title}` : `Save ${track.title}`}
        >{saved ? <Check size={16}/> : <Heart size={16}/>}</button>}
        {playable && playlists.length > 0 && onAddToPlaylist && <label className="playlist-add" title="Add to playlist"><ListPlus size={14}/><select aria-label={`Add ${track.title} to playlist`} defaultValue="" onChange={(event) => { if (event.target.value) onAddToPlaylist(event.target.value, track); event.target.value = ""; }}><option value="">Add to playlist</option>{playlists.map((playlist) => <option key={playlist._id} value={playlist._id}>{playlist.name}</option>)}</select></label>}
        {playable && <button className="play-button" onClick={() => onPlay?.(track)} aria-label={`Play ${track.title}`}>
          <AudioLines size={15}/>
        </button>}
      </div>
    </article>
  );
}
