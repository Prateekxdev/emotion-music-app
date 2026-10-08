import { Search, SlidersHorizontal } from "lucide-react";

const moods = ["any", "happy", "sad", "angry", "neutral", "fear", "surprise", "disgust"];
const languages = ["any", "English", "Hindi", "Tamil", "Telugu", "Kannada", "Malayalam", "Punjabi", "Bengali", "Marathi", "Gujarati", "Urdu", "Korean", "Japanese", "Spanish", "French", "Arabic", "Instrumental / no vocals"];

export default function TrackFilters({ query, setQuery, mood, setMood, language, setLanguage }) {
  return <div className="track-filters" role="search">
    <label className="library-search"><Search size={16}/><span className="sr-only">Search your music</span><input type="search" placeholder="Search songs or artists" value={query} onChange={(event) => setQuery(event.target.value)}/></label>
    <label className="filter-select"><SlidersHorizontal size={14}/><span className="sr-only">Filter by mood</span><select value={mood} onChange={(event) => setMood(event.target.value)}><option value="any">Any mood</option>{moods.slice(1).map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label>
    <label className="filter-select"><span className="sr-only">Filter by language</span><select value={language} onChange={(event) => setLanguage(event.target.value)}><option value="any">Any language</option>{languages.slice(1).map((item) => <option key={item}>{item}</option>)}</select></label>
  </div>;
}
