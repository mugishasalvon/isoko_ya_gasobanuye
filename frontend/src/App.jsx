import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, BadgeCheck, Bookmark, Check, ChevronDown,
  ChevronLeft, ChevronRight, CirclePlay, Clapperboard, Clock3, Compass, Film, Heart, Home, Info, LayoutGrid, Mail, MessageCircle,
  ListVideo, LogIn, Menu, Pause, Play, Plus, Search, Settings, Shield, Sparkles,
  Star, Tv, UserRound, Volume2, X, Phone
} from 'lucide-react';
import {
  Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams
} from 'react-router-dom';
import { api, assetUrl, getErrorMessage } from './api.js';
import { useAuth } from './auth.jsx';
import AdminDashboard from './AdminDashboard.jsx';

const fallbackBackdrop = 'https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?auto=format&fit=crop&w=1920&q=85';

function useRemote(path, enabled = true) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.get(path);
      setData(response.data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [path, enabled]);
  useEffect(() => { refresh(); }, [refresh]);
  return { data, loading, error, refresh };
}

function App() {
  return (
    <div className="app-shell">
      <Header />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/movies" element={<CatalogPage title="Movies" />} />
          <Route path="/series" element={<SeriesPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/categories/:slug" element={<CategoryPage />} />
          <Route path="/movies/:slug" element={<MovieDetailsPage />} />
          <Route path="/series/:slug" element={<SeriesDetailsPage />} />
          <Route path="/series/:slug/seasons/:seasonNumber" element={<SeriesDetailsPage />} />
          <Route path="/watch/:kind/:id" element={<WatchPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/watchlist" element={<SavedPage />} />
          <Route path="/continue-watching" element={<HistoryPage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<Navigate to="/login" replace />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/about" element={<InfoPage title="Stories bring us together." />} />
          <Route path="/contact" element={<SupportPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const signOut = async () => {
    try { await logout(); navigate('/'); } catch (error) { window.alert(getErrorMessage(error)); }
  };

  return (
    <header className="site-header">
      <Link to="/" className="brand" aria-label="SANSARFILMS HUB home">
        <img src="/logo.svg" alt="SANSARFILMS HUB" className="brand-logo" />
      </Link>
      <button className="mobile-menu icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
        {menuOpen ? <X size={21} /> : <Menu size={21} />}
      </button>
      <div className={`nav-content ${menuOpen ? 'nav-open' : ''}`}>
        <nav className="primary-nav desktop-nav">
          <NavLink to="/" end onClick={() => setMenuOpen(false)}><Home size={18} /><span>Home</span></NavLink>
          <NavLink to="/discover" onClick={() => setMenuOpen(false)}><Compass size={18} /><span>Discover</span></NavLink>
          <NavLink to="/movies" onClick={() => setMenuOpen(false)}><Film size={18} /><span>Movies</span></NavLink>
          <NavLink to="/discover?sort=latest" onClick={() => setMenuOpen(false)}><Sparkles size={18} /><span>Latest</span></NavLink>
          <NavLink to="/series" onClick={() => setMenuOpen(false)}><Tv size={18} /><span>Series</span></NavLink>
          <NavLink to="/categories" onClick={() => setMenuOpen(false)}><LayoutGrid size={18} /><span>Categories</span></NavLink>
          {user?.role === 'admin' && <NavLink to="/admin" onClick={() => setMenuOpen(false)}><Shield size={18} /><span>Dashboard</span></NavLink>}
        </nav>
        <div className="header-actions">
          <SearchBox className="search-form" placeholder="Search movies, people..." showShortcut
            onNavigate={() => setMenuOpen(false)} />
          {user ? (
            <div className="account-menu">
              <Link to="/profile" className="avatar-link" aria-label="Your profile">
                <span className="avatar">{user.name?.slice(0, 1).toUpperCase() || <UserRound size={17} />}</span>
              </Link>
              <button className="text-button signout-button" onClick={signOut}>Sign out</button>
            </div>
          ) : <div className="account-menu"><Link className="button button-small button-muted login-link" to="/login">Admin sign in</Link></div>}
        </div>
      </div>
    </header>
  );
}

function MobileBottomNav() {
  const { user } = useAuth();
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      <NavLink to="/" end><Home size={22} /><span>Home</span></NavLink>
      <NavLink to="/discover"><Compass size={22} /><span>Discover</span></NavLink>
      <NavLink to="/movies"><Film size={22} /><span>Movies</span></NavLink>
      <NavLink to="/discover?sort=latest"><Sparkles size={22} /><span>Latest</span></NavLink>
      <NavLink to="/series"><Tv size={22} /><span>Series</span></NavLink>
      <NavLink to="/categories"><LayoutGrid size={22} /><span>Categories</span></NavLink>
      {user?.role === 'admin' && <NavLink to="/admin"><Shield size={22} /><span>Dashboard</span></NavLink>}
    </nav>
  );
}

function SearchBox({ className, placeholder, initialValue = '', autoFocus = false, showShortcut = false, onNavigate }) {
  const [value, setValue] = useState(initialValue);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsError, setSuggestionsError] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const boxRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => { setValue(initialValue); }, [initialValue]);
  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setSuggestionsError('');
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const { data } = await api.get(`/content/suggestions?q=${encodeURIComponent(query)}`);
        if (active) {
          setSuggestions(data.items || []);
          setSuggestionsError('');
        }
      } catch (requestError) {
        if (active) setSuggestionsError(getErrorMessage(requestError));
      }
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [value]);
  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (!boxRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, []);

  const goToSearch = (query) => {
    const normalized = query.trim();
    if (!normalized) return;
    navigate(`/search?q=${encodeURIComponent(normalized)}`);
    setOpen(false);
    onNavigate?.();
  };
  const chooseSuggestion = (suggestion) => {
    navigate(suggestion.href);
    setOpen(false);
    onNavigate?.();
  };
  const submit = (event) => {
    event.preventDefault();
    if (activeIndex >= 0 && suggestions[activeIndex]) chooseSuggestion(suggestions[activeIndex]);
    else goToSearch(value);
  };
  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown' && suggestions.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp' && suggestions.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return <div className={`search-box ${className === 'large-search' ? 'search-box-large' : ''}`} ref={boxRef}>
    <form className={className} onSubmit={submit} role="search">
      <Search size={className === 'large-search' ? 19 : 16} />
      <input aria-label="Search movies, series, categories, and subtitle translators"
        placeholder={placeholder} value={value}
        onChange={(event) => { setValue(event.target.value); setActiveIndex(-1); setOpen(true); }}
        onFocus={() => setOpen(true)} onKeyDown={handleKeyDown} autoFocus={autoFocus}
        autoComplete="off" />
      {showShortcut && <kbd>⌘ K</kbd>}
      {className === 'large-search' && <button className="button button-primary" type="submit">Search</button>}
    </form>
    {open && value.trim() && (suggestions.length > 0 || suggestionsError) && <div className="search-suggestions" role="listbox" aria-label="Search suggestions">
      {suggestions.map((suggestion, index) => <button type="button" role="option"
        aria-selected={index === activeIndex} className={index === activeIndex ? 'selected' : ''}
        key={`${suggestion.type}-${suggestion.href}`}
        onMouseDown={(event) => event.preventDefault()} onClick={() => chooseSuggestion(suggestion)}>
        <span className="suggestion-label">{suggestion.label}</span>
        <span className="suggestion-detail">{suggestion.detail}</span>
      </button>)}
      {suggestionsError && !suggestions.length && <p className="suggestions-error">{suggestionsError}</p>}
      <button type="button" className="suggestions-search-all"
        onMouseDown={(event) => event.preventDefault()} onClick={() => goToSearch(value)}>
        Search all for “{value.trim()}”
      </button>
    </div>}
  </div>;
}

function Footer() {
  return (
    <footer className="site-footer">
      <Link to="/" className="brand footer-brand"><img src="/logo.svg" alt="SANSARFILMS HUB" className="brand-logo footer-brand-logo" /></Link>
      <span>Stories worth staying in for.</span>
      <nav><Link to="/about">About Us</Link><Link to="/contact">Contact Us</Link><Link to="/categories">Explore</Link><Link to="/privacy">Privacy Policy</Link><Link to="/terms">Terms &amp; Conditions</Link></nav>
      <div className="footer-socials" aria-label="Social media">
        <a href="https://www.facebook.com/share/1FHTa9i5eg/" target="_blank" rel="noreferrer" aria-label="Facebook">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 21v-8.25h2.77l.41-3.21H13.5V7.49c0-.93.26-1.56 1.59-1.56h1.7V3.06c-.29-.04-1.3-.12-2.48-.12-2.45 0-4.13 1.5-4.13 4.24v2.36H7.41v3.21h2.77V21h3.32Z"/></svg>
        </a>
        <a href="https://youtube.com/@amabangayinkuru?si=R2HyErSCiS8TJX7d" target="_blank" rel="noreferrer" aria-label="YouTube">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.58 7.19a2.5 2.5 0 0 0-1.76-1.77C18.26 5 12 5 12 5s-6.26 0-7.82.42a2.5 2.5 0 0 0-1.76 1.77A26.1 26.1 0 0 0 2 12a26.1 26.1 0 0 0 .42 4.81 2.5 2.5 0 0 0 1.76 1.77C5.74 19 12 19 12 19s6.26 0 7.82-.42a2.5 2.5 0 0 0 1.76-1.77A26.1 26.1 0 0 0 22 12a26.1 26.1 0 0 0-.42-4.81ZM10 15.46V8.54L15.18 12 10 15.46Z"/></svg>
        </a>
        <a href="https://tiktok.com/@isoko_yagasobanuye" target="_blank" rel="noreferrer" aria-label="TikTok">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.59 7.2a4.83 4.83 0 0 1-3.2-1.2 4.92 4.92 0 0 1-1.62-2.76V3h-3.1v12.2a2.88 2.88 0 1 1-2.88-2.88c.3 0 .59.05.87.14V9.3a6 6 0 1 0 5.1 5.93V9.01a7.93 7.93 0 0 0 4.83 1.61V7.5c0-.1 0-.2 0-.3Z"/></svg>
        </a>
        <a href="https://whatsapp.com/channel/0029VbAK2dILdQebzEBD113v" target="_blank" rel="noreferrer" aria-label="WhatsApp Channel">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.04 2a9.94 9.94 0 0 0-8.5 15.12L2 22l4.99-1.5A9.95 9.95 0 1 0 12.04 2Zm0 18.2a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-2.96.89.9-2.88-.2-.3a8.24 8.24 0 1 1 6.74 3.61Zm4.52-6.17c-.25-.13-1.47-.73-1.7-.81-.23-.09-.4-.13-.56.12-.17.25-.64.81-.79.98-.14.16-.29.19-.54.06-.25-.12-1.05-.39-2-1.23a7.5 7.5 0 0 1-1.38-1.72c-.15-.25-.02-.39.1-.51.12-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.13-.56-1.36-.77-1.86-.2-.48-.41-.41-.56-.42h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07s.89 2.4 1.02 2.56c.12.17 1.75 2.67 4.24 3.75.59.25 1.05.4 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.2-.58.2-1.07.14-1.18-.06-.1-.23-.16-.48-.29Z"/></svg>
        </a>
      </div>
      <div className="site-subfooter"><small>© 2026 SANSARFILMS HUB</small></div>
      <MobileBottomNav />
    </footer>
  );
}

function MovieCard({ movie, rank, variant = 'poster', watchDirect = false, showDescription = false }) {
  const [saved, setSaved] = useState(Boolean(movie.saved));
  const { user } = useAuth();
  const navigate = useNavigate();
  const isSeason = movie.content_type === 'season';
  const isSeries = Boolean(movie.series_id || movie.episode_count !== undefined || movie.content_type === 'series' || isSeason);
  const slug = movie.slug || movie.movie_slug;
  const title = movie.title || movie.movie_title || movie.series_title;
  const poster = assetUrl(movie.poster_url || movie.movie_poster || movie.series_poster) || fallbackBackdrop;
  const translatorName = movie.subtitle_translator_name || movie.movie_subtitle_translator_name;
  const translatorImage = assetUrl(movie.subtitle_translator_image_url || movie.movie_subtitle_translator_image_url);
  const href = movie.watch_url || (isSeason
    ? `/series/${slug}/seasons/${movie.season_number}`
    : watchDirect && !isSeries
    ? `/watch/movie/${movie.id}`
    : isSeries ? `/series/${slug}` : `/movies/${slug}`);
  const toggleSaved = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!user) return;
    try {
      if (saved) {
        await api.delete(`/users/watchlist/${isSeries ? 'series' : 'movie'}/${isSeries ? movie.series_id || movie.id : movie.id}`);
        setSaved(false);
      } else {
        await api.post('/users/watchlist', { type: isSeries ? 'series' : 'movie', id: isSeries ? movie.series_id || movie.id : movie.id });
        setSaved(true);
      }
    } catch (error) {
      window.alert(getErrorMessage(error));
    }
  };
  if (!title) return null;
  return (
    <article className={`movie-card ${variant === 'wide' ? 'movie-card-wide' : ''}`}>
      {rank && <span className="movie-rank">{String(rank).padStart(2, '0')}</span>}
      <div className="poster-wrap">
        <Link to={href} className="poster-link" aria-label={`View ${title}`}>
          <img src={poster || fallbackBackdrop} alt="" className="poster-image" loading="lazy" />
          <div className="poster-overlay">
            <span className="poster-play"><Play size={18} fill="currentColor" /></span>
            <span className="poster-quick">{watchDirect ? 'Watch movie' : 'View title'}</span>
          </div>
        </Link>
        {user && <button className={`save-card ${saved ? 'is-saved' : ''}`} onClick={toggleSaved} aria-label="Add to watchlist">
          {saved ? <Check size={16} /> : <Plus size={16} />}
        </button>}
        {movie.age_rating && <span className="poster-rating">{movie.age_rating}</span>}
      </div>
      <div className="card-copy">
        <Link to={href} className="card-title">{title}</Link>
        <div className="card-meta">
          <span>{movie.release_year || movie.year || 'New'}</span>
          <span className="meta-dot" />
          <span>{movie.genres?.[0] || movie.genre || (isSeries ? 'Series' : 'Feature')}</span>
          {movie.rating > 0 && <span className="card-score"><Star size={12} fill="currentColor" /> {Number(movie.rating).toFixed(1)}</span>}
        </div>
        {translatorName && <div className="card-translator">
          {translatorImage ? <img src={translatorImage} alt="" loading="lazy" /> : <span className="translator-initial">{translatorName.charAt(0).toUpperCase()}</span>}
          <span>Subtitles · {translatorName}</span>
        </div>}
        {showDescription && movie.description && <p className="card-description">{movie.description}</p>}
      </div>
    </article>
  );
}

function MovieSection({ title, eyebrow, movies = [], action, loading = false, rank = false, empty = 'More stories are on their way.' }) {
  return (
    <section className="content-section">
      <div className="section-heading">
        <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>
        <div className="section-heading-actions">
          {action && <Link className="view-all" to={action}>View collection <ArrowRight size={15} /></Link>}
          {movies.length > 4 && <div className="scroll-controls"><button onClick={(e) => e.currentTarget.closest('.content-section').querySelector('.movie-rail').scrollBy({ left: -500, behavior: 'smooth' })} aria-label="Scroll backward"><ChevronLeft size={17} /></button><button onClick={(e) => e.currentTarget.closest('.content-section').querySelector('.movie-rail').scrollBy({ left: 500, behavior: 'smooth' })} aria-label="Scroll forward"><ChevronRight size={17} /></button></div>}
        </div>
      </div>
      {loading ? <div className="movie-rail">{[1, 2, 3, 4, 5].map((item) => <div key={item} className="skeleton-card" />)}</div>
        : movies.length ? <div className="movie-rail">{movies.map((movie, index) => <MovieCard key={movie.id || movie.movie_id || index} movie={movie} rank={rank ? index + 1 : null} />)}</div>
          : <p className="empty-inline">{empty}</p>}
    </section>
  );
}

function HomePage() {
  const { data, loading, error } = useRemote('/content/home?limit=40');
  const [moreItems, setMoreItems] = useState([]);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const items = [...(data?.items || []), ...moreItems];
  const featuredItems = [
    ...items.filter((item) => item.content_type === 'movie').slice(0, 3),
    ...items.filter((item) => item.content_type === 'series').slice(0, 3)
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const [activeSlide, setActiveSlide] = useState(0);
  const activeItem = featuredItems[activeSlide];
  useEffect(() => {
    if (featuredItems.length < 2) {
      setActiveSlide(0);
      return undefined;
    }
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % featuredItems.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [featuredItems.length]);
  const loadMore = async () => {
    setLoadingMore(true);
    setMoreError('');
    try {
      const response = await api.get(`/content/home?limit=40&page=${page + 1}`);
      setMoreItems((current) => [...current, ...response.data.items]);
      setPage((current) => current + 1);
    } catch (requestError) {
      setMoreError(getErrorMessage(requestError));
    } finally {
      setLoadingMore(false);
    }
  };
  return (
    <div className="page-home">
      <section className={`hero ${activeItem ? '' : 'hero-empty'}`}>
        <div className="hero-image" key={`${activeItem?.content_type || 'empty'}-${activeItem?.id || ''}`} style={{
          backgroundImage: `url("${assetUrl(activeItem?.banner_url || activeItem?.poster_url) || fallbackBackdrop}")`
        }} />
        <div className="hero-gradient" />
        <div className="hero-content">
          <div className="hero-kicker"><span className="live-dot" /><span>LATEST MOVIES &amp; SERIES</span></div>
          {activeItem ? <>
            <div className="hero-title-line"><span className="hero-accent">NEW TO SANSARFILMS HUB</span><span className="hero-label">JUST ADDED</span></div>
            <h1>{activeItem.title}</h1>
            <div className="hero-meta">
              <span>{activeItem.content_type === 'series' ? 'Series' : activeItem.release_year || 'New release'}</span>
              {activeItem.content_type === 'movie' && <><span className="hero-sep" /><span>{activeItem.duration_minutes ? `${activeItem.duration_minutes} min` : 'Feature film'}</span></>}
              {activeItem.rating > 0 && <><span className="hero-sep" /><span className="hero-rating"><Star size={14} fill="currentColor" /> {Number(activeItem.rating).toFixed(1)}</span></>}
            </div>
            <p>{activeItem.description}</p>
            <div className="hero-actions">
              {activeItem.content_type === 'movie'
                ? <Link to={`/watch/movie/${activeItem.id}`} className="button button-primary"><Play size={17} fill="currentColor" /> Watch now</Link>
                : <Link to={`/series/${activeItem.slug}`} className="button button-primary"><Play size={17} fill="currentColor" /> View series</Link>}
              <Link to={activeItem.content_type === 'series' ? `/series/${activeItem.slug}` : `/movies/${activeItem.slug}`}
                state={activeItem.content_type === 'movie' ? { initialMovie: activeItem } : undefined}
                className="button button-glass"><Info size={17} /> Details</Link>
            </div>
          </> : <>
            <div className="hero-title-line"><span className="hero-accent">THE SANSARFILMS HUB COLLECTION</span></div>
            <h1>{loading ? 'Finding your next story.' : 'New stories are on the way.'}</h1>
            <p>{error || 'New additions to the collection will appear here.'}</p>
          </>}
        </div>
        <div className="hero-bottom">
          <span className="hero-index"><strong>{String(activeSlide + 1).padStart(2, '0')}</strong><span>/ {String(Math.max(featuredItems.length, 1)).padStart(2, '0')}</span></span>
          <div className="hero-progress">
            {featuredItems.map((item, index) => <button key={`${item.content_type}-${item.id}`} className={index === activeSlide ? 'active' : ''}
              onClick={() => setActiveSlide(index)} aria-label={`Show ${item.title}`} />)}
          </div>
          <div className="hero-arrows">
            <button onClick={() => setActiveSlide((activeSlide + featuredItems.length - 1) % featuredItems.length)}
              disabled={featuredItems.length < 2} aria-label="Previous title"><ArrowLeft size={18} /></button>
            <button onClick={() => setActiveSlide((activeSlide + 1) % featuredItems.length)}
              disabled={featuredItems.length < 2} aria-label="Next title"><ArrowRight size={18} /></button>
          </div>
        </div>
      </section>
      <div className="home-catalog standard-page">
        <PageIntro label="THE SANSARFILMS HUB COLLECTION" title="Movies & series" description="Browse the latest movies and series together. Choose a poster to see its details." />
        <div className="home-catalog-summary"><span><Film size={15} /> {data?.total ?? 0} titles</span><span>Newest first</span></div>
        {loading ? <div className="catalog-grid">{Array.from({ length: 10 }, (_, index) => <div key={index} className="skeleton-card" />)}</div>
          : error ? <div className="state-box"><Info size={22} /><p>{error}</p><small>Check that the API is running and your database has been set up.</small></div>
            : items.length ? <>
              <div className="catalog-grid">{items.map((item) => <MovieCard key={`${item.content_type}-${item.id}`} movie={item} showDescription />)}</div>
              {moreError && <p className="form-error">{moreError}</p>}
              {items.length < data.total && <button className="button button-muted home-load-more" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more'}</button>}
            </> : <div className="state-box"><Clapperboard size={24} /><p>No movies or series are available yet.</p></div>}
      </div>
    </div>
  );
}

function GenreCloud({ categories }) {
  return <section className="genre-section"><div className="section-heading"><div><span className="eyebrow">MOOD FIRST, TITLES SECOND</span><h2>Find your genre</h2></div><Link className="view-all" to="/categories">All genres <ArrowRight size={15} /></Link></div><div className="genre-grid">{categories.map((category, index) => <Link className={`genre-tile genre-${index % 6}`} key={category.id} to={`/categories/${category.slug}`}><span>{category.name}</span><ArrowRight size={16} /></Link>)}</div></section>;
}

function PageIntro({ label, title, description, children }) {
  return <div className="page-intro"><span className="eyebrow">{label}</span><h1>{title}</h1>{description && <p>{description}</p>}{children}</div>;
}

function DiscoverPage() {
  const [params, setParams] = useSearchParams();
  const activeSort = params.get('sort') || 'latest';
  const category = params.get('category') || '';
  const { data: categoriesData } = useRemote('/content/categories');
  const { data, loading, error } = useRemote(`/content/catalog?limit=40&sort=${encodeURIComponent(activeSort)}${category ? `&category=${encodeURIComponent(category)}` : ''}`);
  const [moreItems, setMoreItems] = useState([]);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const items = [...(data?.items || []), ...moreItems];
  useEffect(() => {
    setMoreItems([]);
    setPage(1);
    setMoreError('');
  }, [activeSort, category]);
  const loadMore = async () => {
    setLoadingMore(true);
    setMoreError('');
    try {
      const response = await api.get(`/content/catalog?limit=40&page=${page + 1}&sort=${encodeURIComponent(activeSort)}${category ? `&category=${encodeURIComponent(category)}` : ''}`);
      setMoreItems((current) => [...current, ...response.data.items]);
      setPage((current) => current + 1);
    } catch (requestError) {
      setMoreError(getErrorMessage(requestError));
    } finally {
      setLoadingMore(false);
    }
  };
  return <div className="standard-page">
    <PageIntro label="THE COMPLETE COLLECTION" title="Discover" description="Browse published movies and seasons, sorted by upload time, views, or rating." />
    <div className="filter-bar">
      <span><Film size={15} /> {data?.total ?? 0} titles</span>
      <label>Sort <span className="select-wrap"><select value={activeSort} onChange={(event) => {
        const next = new URLSearchParams(params);
        if (event.target.value === 'latest') next.delete('sort');
        else next.set('sort', event.target.value);
        setParams(next);
      }}><option value="latest">Latest</option><option value="popular">Most watched</option><option value="top">Top rated</option></select><ChevronDown size={14} /></span></label>
      <label>Genre <span className="select-wrap"><select value={category} onChange={(event) => {
        const next = new URLSearchParams(params);
        if (event.target.value) next.set('category', event.target.value);
        else next.delete('category');
        setParams(next);
      }}><option value="">All genres</option>{categoriesData?.items?.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</select><ChevronDown size={14} /></span></label>
    </div>
    <CatalogGrid items={items} loading={loading} error={error} />
    {moreError && <p className="form-error">{moreError}</p>}
    {!loading && !error && items.length < (data?.total || 0) && <button className="button button-muted home-load-more" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more'}</button>}
  </div>;
}

function CatalogPage({ title, sort }) {
  const [params, setParams] = useSearchParams();
  const [category, setCategory] = useState('');
  const activeSort = params.get('sort') || sort || 'latest';
  const { data: categoriesData } = useRemote('/content/categories');
  const url = `/content/movies?limit=40&sort=${activeSort}${category ? `&category=${encodeURIComponent(category)}` : ''}`;
  const { data, loading, error } = useRemote(url);
  return <div className="standard-page"><PageIntro label="YOUR NEXT FAVORITE" title={title} description="A little bit of everything, sorted for your kind of night." /><div className="filter-bar"><span><Film size={15} /> {data?.total ?? 0} titles</span><label>Sort <span className="select-wrap"><select value={activeSort} onChange={(event) => setParams(event.target.value === 'latest' ? {} : { sort: event.target.value })}><option value="latest">Latest</option><option value="trending">Trending</option><option value="popular">Most watched</option><option value="top">Top rated</option></select><ChevronDown size={14} /></span></label><label>Genre <span className="select-wrap"><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All genres</option>{categoriesData?.items?.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</select><ChevronDown size={14} /></span></label></div><CatalogGrid items={data?.items || []} loading={loading} error={error} /></div>;
}

function CatalogGrid({ items, loading, error, empty = 'No titles here just yet. Check back soon.' }) {
  if (loading) return <div className="catalog-grid">{Array.from({ length: 10 }, (_, index) => <div key={index} className="skeleton-card" />)}</div>;
  if (error) return <div className="state-box"><Info size={22} /><p>{error}</p><small>Check that the API is running and your database has been set up.</small></div>;
  if (!items.length) return <div className="state-box"><Clapperboard size={24} /><p>{empty}</p></div>;
  return <div className="catalog-grid">{items.map((item, index) => <MovieCard key={`${item.content_type || 'movie'}-${item.id || index}-${item.season_number || ''}`} movie={item} />)}</div>;
}

function SeriesPage() {
  const { data, loading, error } = useRemote('/content/series?limit=40');
  return <div className="standard-page"><PageIntro label="EPISODE AFTER EPISODE" title="Series" description="Get comfortable. These stories have a little more to tell." /><CatalogGrid items={data?.items || []} loading={loading} error={error} empty="New series are on the way." /></div>;
}

function CategoriesPage() {
  const { data } = useRemote('/content/categories');
  return <div className="standard-page"><PageIntro label="MOOD FIRST, TITLES SECOND" title="Browse by genre" description="Sometimes you know the feeling. We'll help you find the story." /><GenreCloud categories={data?.items || []} /></div>;
}

function CategoryPage() {
  const { slug } = useParams();
  const { data: categories } = useRemote('/content/categories');
  const category = categories?.items?.find((item) => item.slug === slug);
  const { data, loading, error } = useRemote(`/content/catalog?category=${encodeURIComponent(slug)}&limit=40`);
  return <div className="standard-page"><PageIntro label="EXPLORE THE COLLECTION" title={category?.name || 'Genre'} description={`Movies and seasons picked from the ${category?.name || slug} shelf.`} /><CatalogGrid items={data?.items || []} loading={loading} error={error} /></div>;
}

function MovieDetailsPage() {
  const { slug } = useParams();
  const location = useLocation();
  const initialMovie = location.state?.initialMovie?.slug === slug ? location.state.initialMovie : null;
  const { data, loading, error } = useRemote(`/content/movies/${encodeURIComponent(slug)}`);
  if (loading && !initialMovie) return <LoadingPage />;
  if (error || (!loading && !data?.item)) return <ErrorPage message={error || 'Title not found.'} />;
  const movie = data?.item || initialMovie;
  return <div className="details-page movie-details-page">
    <section className="series-detail-hero">
      <div className="series-hero-backdrop" style={{ backgroundImage: `url("${assetUrl(movie.banner_url || movie.poster_url) || fallbackBackdrop}")` }} />
      <div className="series-hero-shade" />
      <div className="series-hero-content">
        <div className="movie-poster-column">
          <img className="series-poster-card" src={assetUrl(movie.poster_url || movie.banner_url) || fallbackBackdrop} alt={`${movie.title} poster`} />
          {movie.subtitle_translator_name && <div className="translator-detail movie-poster-translator">
            {movie.subtitle_translator_image_url ? <img src={assetUrl(movie.subtitle_translator_image_url)} alt="" /> : <span className="translator-initial">{movie.subtitle_translator_name.charAt(0).toUpperCase()}</span>}
            <p><span>SUBTITLES BY</span>{movie.subtitle_translator_name}</p>
          </div>}
        </div>
        <div className="series-hero-copy">
          <Link to="/movies" className="back-link"><ArrowLeft size={15} /> All movies</Link>
          <span className="eyebrow">SANSARFILMS HUB COLLECTION</span><h1>{movie.title}</h1>
          <div className="details-meta"><span className="detail-rating"><Star size={14} fill="currentColor" /> {Number(movie.rating).toFixed(1)}</span><span>{movie.release_year}</span><span>{movie.duration_minutes ? `${movie.duration_minutes} min` : 'Feature film'}</span>{movie.age_rating && <span className="age-badge">{movie.age_rating}</span>}</div>
          <div className="detail-genres">{movie.genres?.map((genre) => <span key={genre}>{genre}</span>)}</div>
          <p className="details-description">{movie.description}</p>
          <div className="hero-actions"><Link to={`/watch/movie/${movie.id}`} className="button button-primary"><Play size={17} fill="currentColor" /> Watch movie</Link></div>
          <div className="credits-row">{movie.director && <p><span>DIRECTED BY</span>{movie.director}</p>}{movie.cast?.length > 0 && <p><span>STARRING</span>{movie.cast.join(' · ')}</p>}{movie.subtitle_translator_name && <div className="translator-detail">{movie.subtitle_translator_image_url ? <img src={assetUrl(movie.subtitle_translator_image_url)} alt="" /> : <span className="translator-initial">{movie.subtitle_translator_name.charAt(0).toUpperCase()}</span>}<p><span>SUBTITLES BY</span>{movie.subtitle_translator_name}</p></div>}</div>
          <RatingForm type="movie" id={movie.id} />
        </div>
      </div>
    </section>
    <div className="related-section"><MovieSection title="Keep the feeling going" eyebrow="YOU MIGHT ALSO LIKE" movies={data?.related || []} /></div>
  </div>;
}

function RatingForm({ type, id }) {
  const { user } = useAuth();
  const [rating, setRating] = useState('8');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    api.get(`/users/ratings/${type}/${id}`).then(({ data }) => {
      if (active && data.rating) setRating(String(data.rating));
    }).catch((requestError) => {
      if (active) setError(getErrorMessage(requestError));
    });
    return () => { active = false; };
  }, [id, type, user]);
  const submit = async (event) => {
    event.preventDefault();
    if (!user) return;
    setError(''); setStatus('');
    try {
      const { data } = await api.post('/users/ratings', { type, id, rating: Number(rating) });
      setStatus(`Thanks for rating this ${type}. Current score: ${data.rating ?? rating}/10.`);
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  };
  if (!user) return null;
  return <form className="rating-form" onSubmit={submit}>
    <label htmlFor={`rating-${type}-${id}`}>Your rating</label>
    <select id={`rating-${type}-${id}`} value={rating} onChange={(event) => setRating(event.target.value)}>{Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} / 10</option>)}</select>
    <button className="button button-muted button-small">Rate this title</button>
    {status && <span>{status}</span>}{error && <span className="form-error">{error}</span>}
  </form>;
}

function DownloadButton({ kind, id, qualities = [] }) {
  const options = qualities.length ? qualities : ['original'];
  const [quality, setQuality] = useState(options[0]);
  const optionKey = options.join(',');
  useEffect(() => { setQuality(options[0]); }, [id, kind, optionKey]);
  return <div className="download-control">
    {options.length > 1 && <select className="download-quality" value={quality} onChange={(event) => setQuality(event.target.value)} aria-label="Download quality">
      {options.map((option) => <option key={option} value={option}>{option === 'original' ? 'Original' : option}</option>)}
    </select>}
    <a className="button button-glass" href={`${api.defaults.baseURL}/media/${kind}/${id}/download?quality=${encodeURIComponent(quality)}`}>
      <ArrowDownToLine size={17} /> Download{options.length === 1 && options[0] !== 'original' ? ` · ${options[0]}` : ''}
    </a>
  </div>;
}

function SeriesDetailsPage() {
  const { slug, seasonNumber } = useParams();
  const { data, loading, error } = useRemote(`/content/series/${encodeURIComponent(slug)}`);
  if (loading) return <LoadingPage />;
  if (error || !data?.item) return <ErrorPage message={error || 'Series not found.'} />;
  const series = data.item;
  const selectedSeason = series.seasons.find((season) => String(season.season_number) === seasonNumber);
  if (seasonNumber && !selectedSeason) return <ErrorPage message="Season not found." />;
  return <div className="series-page">
    <section className="series-detail-hero">
      <div className="series-hero-backdrop" style={{ backgroundImage: `url("${assetUrl(series.banner_url || series.poster_url) || fallbackBackdrop}")` }} />
      <div className="series-hero-shade" />
      <div className="series-hero-content">
        <img className="series-poster-card" src={assetUrl(series.poster_url || series.banner_url) || fallbackBackdrop} alt={`${series.title} poster`} />
        <div className="series-hero-copy">
          <Link to="/series" className="back-link"><ArrowLeft size={15} /> All series</Link>
          <span className="eyebrow">YOUR NEXT BINGE</span><h1>{series.title}</h1>
          <div className="details-meta"><span className="detail-rating"><Star size={14} fill="currentColor" /> {Number(series.rating).toFixed(1)}</span><span>{series.release_year}</span><span>{series.seasons.length} seasons</span><span>{series.seasons.reduce((total, item) => total + item.episodes.length, 0)} episodes</span></div>
          <div className="detail-genres">{series.genres?.map((genre) => <span key={genre}>{genre}</span>)}</div>
          <p className="details-description">{series.description}</p>
          {(series.cast?.length > 0 || series.subtitle_translator_name) && <div className="credits-row">{series.cast?.length > 0 && <p><span>STARRING</span>{series.cast.join(' · ')}</p>}{series.subtitle_translator_name && <div className="translator-detail">{series.subtitle_translator_image_url ? <img src={assetUrl(series.subtitle_translator_image_url)} alt="" /> : <span className="translator-initial">{series.subtitle_translator_name.charAt(0).toUpperCase()}</span>}<p><span>SUBTITLES BY</span>{series.subtitle_translator_name}</p></div>}</div>}
          <RatingForm type="series" id={series.id} />
        </div>
      </div>
    </section>
    <div className="details-content series-content">
      <div className="episodes-area">
        {selectedSeason ? <>
          <Link className="back-link season-back-link" to={`/series/${series.slug}`}><ArrowLeft size={15} /> All seasons</Link>
          <div className="season-feature-card season-detail-heading">
            <img className="season-card-poster" src={assetUrl(selectedSeason.poster_url || series.poster_url || series.banner_url) || fallbackBackdrop} alt="" />
            <span className="season-card-copy"><span className="eyebrow">{series.title}</span><strong>{selectedSeason.title || `Season ${selectedSeason.season_number}`}</strong>
              <span className="season-card-count">{selectedSeason.episodes.length} {selectedSeason.episodes.length === 1 ? 'episode' : 'episodes'}</span>
              {series.subtitle_translator_name && <span className="season-card-translator">
                {series.subtitle_translator_image_url
                  ? <img className="season-card-translator-avatar" src={assetUrl(series.subtitle_translator_image_url)} alt="" />
                  : <span className="translator-initial">{series.subtitle_translator_name.charAt(0).toUpperCase()}</span>}
                <span>Subtitles by {series.subtitle_translator_name}</span>
              </span>}
            </span>
          </div>
          <div className="episode-list">
            {selectedSeason.episodes.map((episode) => <article className="episode-card" key={episode.id}><div className="episode-thumb" style={{ backgroundImage: `url("${assetUrl(episode.thumbnail_url || series.banner_url) || fallbackBackdrop}")` }}><span>{String(episode.episode_number).padStart(2, '0')}</span><Link to={`/watch/episode/${episode.id}`} className="episode-play" aria-label={`Play ${episode.title}`}><Play size={18} fill="currentColor" /></Link></div><div className="episode-copy"><span className="episode-number">EPISODE {String(episode.episode_number).padStart(2, '0')}{episode.duration_minutes ? ` · ${episode.duration_minutes} MIN` : ''}</span><h3>{episode.title}</h3><p>{episode.description}</p></div><div className="episode-actions"><Link to={`/watch/episode/${episode.id}`} className="button button-muted button-small"><Play size={14} /> Play</Link>{episode.downloads_enabled && episode.download_qualities?.length > 0 && <DownloadButton kind="episode" id={episode.id} qualities={episode.download_qualities} />}</div></article>)}
            {!selectedSeason.episodes.length && <p className="empty-inline">Episodes for this season are coming soon.</p>}
          </div>
        </> : <>
          <div className="episode-header"><div><span className="eyebrow">THE EPISODES</span><h2>{series.seasons.length} {series.seasons.length === 1 ? 'season' : 'seasons'}</h2></div></div>
          <div className="catalog-grid season-card-grid">{series.seasons.map((season) => {
            const seasonTitle = season.title || `Season ${season.season_number}`;
            const seasonUrl = `/series/${series.slug}/seasons/${season.season_number}`;
            return <article className="movie-card season-movie-card" key={season.id}>
              <div className="poster-wrap">
                <Link to={seasonUrl} className="poster-link" aria-label={`View ${seasonTitle} episodes`}>
                  <img className="poster-image" src={assetUrl(season.poster_url || series.poster_url || series.banner_url) || fallbackBackdrop} alt="" loading="lazy" />
                  <div className="poster-overlay"><span className="poster-play"><Play size={18} fill="currentColor" /></span><span className="poster-quick">View episodes</span></div>
                </Link>
              </div>
              <div className="card-copy">
                <Link to={seasonUrl} className="card-title">{seasonTitle}</Link>
                <div className="card-meta"><span>Season {season.season_number}</span><span className="meta-dot" /><span>{season.episodes.length} {season.episodes.length === 1 ? 'episode' : 'episodes'}</span></div>
                {series.subtitle_translator_name && <div className="card-translator">
                  {series.subtitle_translator_image_url
                    ? <img src={assetUrl(series.subtitle_translator_image_url)} alt="" loading="lazy" />
                    : <span className="translator-initial">{series.subtitle_translator_name.charAt(0).toUpperCase()}</span>}
                  <span>Subtitles · {series.subtitle_translator_name}</span>
                </div>}
              </div>
            </article>;
          })}</div>
        </>}
      </div>
    </div>
  </div>;
}

function SearchPage() {
  const [params] = useSearchParams();
  const query = params.get('q') || '';
  const { data, loading, error } = useRemote(`/content/movies?search=${encodeURIComponent(query)}&limit=40`, Boolean(query));
  const { data: series } = useRemote(`/content/series?search=${encodeURIComponent(query)}&limit=20`, Boolean(query));
  const items = [...(data?.items || []), ...(series?.items || [])];
  return <div className="standard-page"><PageIntro label="GOOD THINGS, FOUND" title={query ? `Results for “${query}”` : 'Search'} description={query ? `${items.length} titles to look through.` : 'Search films, series, categories, cast, or subtitle translators.'}><SearchBox key={query} className="large-search" initialValue={query} placeholder="What are you in the mood for?" autoFocus /></PageIntro><CatalogGrid items={items} loading={loading} error={error} empty={query ? 'No titles matched that search. Try another name or genre.' : 'Enter a title to start exploring.'} /></div>;
}

function AuthPage() {
  const { setUser } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const { data } = await api.post('/auth/login', values);
      setUser(data.user);
      navigate('/admin');
    } catch (err) { setError(getErrorMessage(err)); } finally { setBusy(false); }
  };
  return <div className="auth-page"><div className="auth-aside"><div className="auth-art" /><span className="eyebrow">SANSARFILMS HUB ADMINISTRATION</span><h2>Manage the stories worth staying in for.</h2><p>Administrator sign-in is required to manage the SANSARFILMS HUB catalogue.</p></div><form className="auth-card" onSubmit={submit}><span className="eyebrow">ADMIN ACCESS</span><h1>Administrator sign in.</h1><p>Sign in with your private administrator credentials.</p><label>Email address<input name="email" type="email" autoComplete="username" required placeholder="Admin email address" /></label><label>Password<input name="password" type="password" autoComplete="current-password" required placeholder="Administrator password" /></label>{error && <p className="form-error">{error}</p>}<button className="button button-primary auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={17} /></button></form></div>;
}

function WatchPage() {
  const { kind, id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const media = useRemote(kind === 'episode'
    ? `/content/episodes/${encodeURIComponent(id)}`
    : `/content/movies/id/${encodeURIComponent(id)}`);
  const history = useRemote('/users/history', Boolean(user));
  const [error, setError] = useState('');
  const lastSaved = useRef(0);
  const restored = useRef('');
  const videoElement = useRef(null);
  const item = media.data?.item;
  const qualityKey = item?.download_qualities?.join(',') || '';
  const videoRef = useCallback((node) => {
    videoElement.current = node;
    if (!node || !item || !qualityKey) return undefined;
    const url = `${api.defaults.baseURL}/media/${kind}/${id}/stream`;
    node.src = url;
    return () => { node.removeAttribute('src'); node.load(); };
  }, [id, item, kind, qualityKey]);
  useEffect(() => {
    if (item && !qualityKey) {
      setError('No video file is available for this title yet. An admin can upload one from Dashboard → Movies. The banner image is shown above in the meantime.');
    } else {
      setError('');
    }
  }, [id, item, qualityKey]);
  const mediaTitle = item?.title || item?.series_title;
  const progress = history.data?.items?.find((entry) => String(
    kind === 'movie' ? entry.movie_id : entry.episode_id
  ) === id);
  useEffect(() => {
    const video = videoElement.current;
    if (!video || !progress?.progress_seconds || video.readyState < 1 || restored.current === id) return;
    if (progress.progress_seconds < video.duration - 30) video.currentTime = progress.progress_seconds;
    restored.current = id;
  }, [id, progress]);
  const saveProgress = async (event, force = false) => {
    const video = event.currentTarget;
    if (!user || !Number.isFinite(video.duration) || !video.duration) return;
    if (!force && Date.now() - lastSaved.current < 15000) return;
    lastSaved.current = Date.now();
    try {
      await api.put('/users/history', {
        [kind === 'movie' ? 'movie_id' : 'episode_id']: Number(id),
        progress_seconds: Math.floor(video.currentTime),
        duration_seconds: Math.floor(video.duration)
      });
    } catch (err) { setError(getErrorMessage(err)); }
  };
  const restoreProgress = () => {
    const video = videoElement.current;
    if (video && progress?.progress_seconds && progress.progress_seconds < video.duration - 30) {
      video.currentTime = progress.progress_seconds;
      restored.current = id;
    }
  };
  const nextEpisode = item?.next_episode;
  const title = kind === 'episode' ? `${item?.series_title || ''}${item?.season_number ? ` · Season ${item.season_number}` : ''}` : '';
  return <div className="watch-page">
    <Link to={kind === 'movie' ? '/movies' : '/series'} className="back-link"><ArrowLeft size={15} /> Back to browsing</Link>
    <div className="video-frame"><video ref={videoRef} poster={assetUrl(item?.banner_url || item?.poster_url) || undefined} controls autoPlay playsInline crossOrigin="use-credentials"
      onTimeUpdate={saveProgress} onPause={(event) => saveProgress(event, true)}
      onLoadedMetadata={restoreProgress}
      onEnded={() => nextEpisode && navigate(`/watch/episode/${nextEpisode.id}`)}
      onError={() => setError(item?.download_qualities?.length
        ? 'The uploaded video could not be played. Try an MP4 file encoded with H.264 video and AAC audio.'
        : 'No video file is available for this title yet. An admin can upload one from Dashboard → Movies. The banner image is shown above in the meantime.')}>
      {item?.subtitles?.map((track) => <track key={track.id} kind="subtitles"
        label={track.label} srcLang={track.language}
        src={assetUrl(`/api/media/subtitles/${track.id}`)} />)}
    </video>{!error && media.loading && <div className="video-loading"><span className="loader" /> Preparing your film…</div>}</div>
    <div className="player-title"><div><span className="eyebrow">{kind === 'movie' ? 'NOW PLAYING' : title || 'EPISODE'}</span><h1>{mediaTitle || 'Your feature presentation'}</h1></div><div className="player-actions">{item?.downloads_enabled && item.download_qualities?.length > 0 && <DownloadButton kind={kind} id={id} qualities={item.download_qualities} />}{nextEpisode && <button className="button button-muted" onClick={() => navigate(`/watch/episode/${nextEpisode.id}`)}>Next episode <ArrowRight size={15} /></button>}</div></div>
    {error && <p className="form-error">{error}</p>}
    {item && <CommentsSection kind={kind} id={id} />}
  </div>;
}

function CommentsSection({ kind, id }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/content/comments/${kind}/${id}`);
      setItems(data.items || []);
      setError('');
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setLoading(false); }
  }, [id, kind]);
  useEffect(() => { load(); }, [load]);
  const submit = async (event) => {
    event.preventDefault();
    if (!body.trim() || busy) return;
    if (!isAdmin && (!name.trim() || !email.trim())) return;
    setBusy(true);
    try {
      const payload = isAdmin ? { body: body.trim() } : { name: name.trim(), email: email.trim(), body: body.trim() };
      const { data } = await api.post(`/content/comments/${kind}/${id}`, payload);
      setItems((prev) => [data.item, ...prev].sort((a, b) => (Number(b.is_admin) - Number(a.is_admin)) || (new Date(b.created_at) - new Date(a.created_at))));
      setBody('');
      setError('');
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  };
  return <section className="comments-section">
    <h2>Comments</h2>
    <form className="comment-form" onSubmit={submit}>
      {isAdmin ? <p className="comment-admin-identity">Commenting as <strong>{user.name}</strong>{user.email ? <span> ({user.email})</span> : ''} <span className="comment-admin-badge">Admin</span></p>
        : <><label>Name<input value={name} onChange={(event) => setName(event.target.value)} required maxLength="100" placeholder="Your name" /></label>
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength="254" placeholder="Your email" /></label></>}
      <label>Message<textarea value={body} onChange={(event) => setBody(event.target.value)} rows="3" maxLength="2000" required placeholder="Share your thoughts…" /></label>
      <button className="button button-primary button-small" type="submit" disabled={busy || !body.trim() || (!isAdmin && (!name.trim() || !email.trim()))}>{busy ? 'Posting…' : 'Post comment'}</button>
    </form>
    {error && <p className="form-error">{error}</p>}
    {loading ? <p className="empty-inline">Loading comments…</p>
      : items.length ? <div className="comment-list">{items.map((comment) => <article className={`comment-item ${comment.is_admin ? 'comment-admin' : ''}`} key={comment.id}><div className="comment-meta"><div className="comment-author"><strong>{comment.user_name}</strong>{comment.is_admin && <span className="comment-admin-badge">Admin</span>}{comment.is_admin && comment.user_email && <span className="comment-admin-email">{comment.user_email}</span>}</div><time>{new Date(comment.created_at).toLocaleString()}</time></div><p>{comment.body}</p></article>)}</div>
      : <p className="empty-inline">No comments yet. Be the first to share your thoughts.</p>}
  </section>;
}

function SavedPage() {
  const { user } = useAuth();
  const { data, loading, error } = useRemote('/users/watchlist', Boolean(user));
  if (!user) return <AuthGate title="Your watchlist goes where you go." />;
  const items = (data?.items || []).map((item) => ({
    ...item, id: item.movie_id || item.series_id, series_id: item.series_id,
    title: item.movie_title || item.series_title, slug: item.movie_slug || item.series_slug,
    poster_url: item.movie_poster || item.series_poster, saved: true
  }));
  return <div className="standard-page"><PageIntro label="SAVED FOR A GOOD NIGHT" title="My watchlist" description="All the stories you want to get back to, in one place." /><CatalogGrid items={items} loading={loading} error={error} empty="Save a title with the + button and it will be waiting here." /></div>;
}

function HistoryPage() {
  const { user } = useAuth();
  const { data, loading, error } = useRemote('/users/history', Boolean(user));
  if (!user) return <AuthGate title="Your next episode is right where you left it." />;
  const items = (data?.items || []).map((item) => ({
    ...item,
    id: item.movie_id || item.episode_id,
    title: item.movie_title || item.episode_title,
    slug: item.movie_slug || item.series_slug,
    poster_url: item.movie_poster || item.episode_poster,
    watch_url: item.episode_id ? `/watch/episode/${item.episode_id}` : `/watch/movie/${item.movie_id}`
  }));
  return <div className="standard-page"><PageIntro label="RIGHT WHERE YOU LEFT OFF" title="Keep watching" description="Pick up the stories you’ve already started." /><CatalogGrid items={items} loading={loading} error={error} empty="Start watching a film and your progress will show up here." /></div>;
}

function AuthGate({ title }) { return <div className="gate-page"><Bookmark size={30} /><span className="eyebrow">ADMINISTRATOR ACCESS ONLY</span><h1>{title}</h1><p>Only administrators can sign in to this site.</p><Link to="/login" className="button button-primary">Admin sign in <ArrowRight size={16} /></Link></div>; }

function ProfilePage() {
  const { user, logout, setUser } = useAuth();
  const { data, loading } = useRemote('/users/downloads', Boolean(user));
  const [profileError, setProfileError] = useState('');
  const [profileNotice, setProfileNotice] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const navigate = useNavigate();
  if (!user) return <AuthGate title="All your stories, all in one place." />;
  const signOut = async () => { try { await logout(); navigate('/'); } catch (error) { window.alert(getErrorMessage(error)); } };
  const saveProfile = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    setSavingProfile(true); setProfileError(''); setProfileNotice('');
    const body = Object.fromEntries(new FormData(form).entries());
    if (!body.current_password) delete body.current_password;
    if (!body.new_password) delete body.new_password;
    try {
      const { data: result } = await api.put('/users/profile', body);
      setUser(result.user);
      form.elements.current_password.value = '';
      form.elements.new_password.value = '';
      setProfileNotice('Your profile has been updated.');
    } catch (err) { setProfileError(getErrorMessage(err)); }
    finally { setSavingProfile(false); }
  };
  return <div className="standard-page profile-page"><PageIntro label="YOUR SANSARFILMS HUB" title="A little space that's yours." description="Your account, your saved stories, your own pace." /><div className="profile-layout"><aside className="profile-card"><span className="profile-avatar">{user.name.slice(0, 1).toUpperCase()}</span><h2>{user.name}</h2><span>{user.email}</span><small>MEMBER SINCE {new Date(user.created_at || Date.now()).getFullYear()}</small><div className="profile-menu"><Link to="/watchlist"><Bookmark size={16} /> My watchlist <ArrowRight size={15} /></Link><Link to="/continue-watching"><Clock3 size={16} /> Keep watching <ArrowRight size={15} /></Link>{user.role === 'admin' && <Link to="/admin"><Settings size={16} /> Studio dashboard <ArrowRight size={15} /></Link>}<button onClick={signOut}><LogIn size={16} /> Sign out <ArrowRight size={15} /></button></div></aside><div className="profile-info"><section className="profile-edit"><span className="eyebrow">ACCOUNT SETTINGS</span><h2>Make it yours.</h2>{profileError && <p className="form-error">{profileError}</p>}{profileNotice && <p className="profile-notice">{profileNotice}</p>}<form className="admin-form" onSubmit={saveProfile}><label>Display name<input name="name" required minLength="2" maxLength="100" defaultValue={user.name} /></label><label>Email address<input value={user.email} disabled /></label><label>Current password <small>Only required to change your password</small><input name="current_password" type="password" autoComplete="current-password" /></label><label>New password <small>Leave blank to keep your current password</small><input name="new_password" type="password" minLength="8" autoComplete="new-password" /></label><button className="button button-primary" disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save account settings'}</button></form></section><div className="profile-info-head"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Your download history</h2></div><ArrowDownToLine size={20} /></div>{loading ? <p className="empty-inline">Loading your library…</p> : data?.items?.length ? data.items.map((item) => <div className="download-row" key={item.id}><Film size={17} /><div><strong>{item.movie_title || item.episode_title}</strong><span>{item.series_title || `Downloaded ${item.quality}`}</span></div><small>{new Date(item.created_at).toLocaleDateString()}</small></div>) : <div className="empty-inline">Your downloads will appear here.</div>}</div></div></div>;
}

function AdminPage() {
  const { user } = useAuth();
  const { data: stats, refresh: refreshStats } = useRemote('/admin/stats', user?.role === 'admin');
  const { data: movieData, refresh: refreshMovies } = useRemote('/admin/movies', user?.role === 'admin');
  const { data: seriesData, refresh: refreshSeries } = useRemote('/admin/series', user?.role === 'admin');
  const { data: categoryData, refresh: refreshCategories } = useRemote('/content/categories', user?.role === 'admin');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('movies');
  const refreshAll = () => Promise.all([refreshStats(), refreshMovies(), refreshSeries(), refreshCategories()]);
  if (!user) return <AuthGate title="The studio is for the people behind the stories." />;
  if (user.role !== 'admin') return <ErrorPage message="Administrator access is required." />;

  const submitMovie = async (event) => {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const categories = [...form.querySelectorAll('input[name="category_ids"]:checked')].map((item) => Number(item.value));
    values.category_ids = JSON.stringify(categories);
    values.is_published = values.is_published === 'on';
    values.downloads_enabled = values.downloads_enabled === 'on';
    const poster = form.elements.poster.files[0];
    const banner = form.elements.banner.files[0];
    const video = form.elements.video.files[0];
    for (const key of ['poster', 'banner', 'video']) delete values[key];
    const body = new FormData();
    Object.entries(values).forEach(([key, value]) => body.append(key, value));
    if (poster) body.append('poster', poster);
    if (banner) body.append('banner', banner);
    if (video) body.append('video', video);
    try {
      await api.post('/admin/movies', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      form.reset(); setNotice('Your film was added to the catalogue.'); await refreshAll();
    } catch (err) { setError(getErrorMessage(err)); } finally { setBusy(false); }
  };
  const submitSeries = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    values.category_ids = JSON.stringify([...form.querySelectorAll('input[name="category_ids"]:checked')].map((item) => Number(item.value)));
    values.cast = JSON.stringify(values.cast ? values.cast.split(',').map((name) => name.trim()).filter(Boolean) : []);
    values.is_published = values.is_published === 'on';
    const body = new FormData();
    Object.entries(values).forEach(([key, value]) => body.append(key, value));
    ['poster', 'banner'].forEach((key) => { if (form.elements[key].files[0]) body.append(key, form.elements[key].files[0]); });
    try { await api.post('/admin/series', body, { headers: { 'Content-Type': 'multipart/form-data' } }); form.reset(); setNotice('Your series was added to the catalogue.'); await refreshAll(); }
    catch (err) { setError(getErrorMessage(err)); } finally { setBusy(false); }
  };
  const addCategory = async (event) => {
    event.preventDefault(); const form = event.currentTarget;
    try { await api.post('/admin/categories', Object.fromEntries(new FormData(form).entries())); form.reset(); await refreshCategories(); setNotice('Genre created.'); }
    catch (err) { setError(getErrorMessage(err)); }
  };
  const deleteTitle = async (type, id) => {
    if (!window.confirm('Delete this title? Related seasons, episodes, and saved items will also be removed.')) return;
    try { await api.delete(`/admin/${type}/${id}`); await refreshAll(); }
    catch (err) { setError(getErrorMessage(err)); }
  };
  const publishTitle = async (movie) => {
    try { await api.put(`/admin/movies/${movie.id}/publish`, { is_published: !movie.is_published }); await refreshAll(); }
    catch (err) { setError(getErrorMessage(err)); }
  };
  const addSeason = async (event, item) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try { const { data } = await api.post(`/admin/series/${item.id}/seasons`, values); setNotice(`Season ${data.season_number} added to ${item.title}.`); event.currentTarget.reset(); }
    catch (err) { setError(getErrorMessage(err)); }
  };
  const addEpisode = async (event) => {
    event.preventDefault(); const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const video = form.elements.video.files[0]; delete values.video;
    const body = new FormData(); Object.entries(values).forEach(([key, value]) => body.append(key, value));
    if (video) body.append('video', video);
    try { await api.post(`/admin/seasons/${values.season_id}/episodes`, body, { headers: { 'Content-Type': 'multipart/form-data' } }); form.reset(); setNotice('Episode added.'); }
    catch (err) { setError(getErrorMessage(err)); }
  };
  const statsItems = [
    ['Published films', stats?.stats?.movies ?? '—', Film],
    ['Series', stats?.stats?.series ?? '—', Tv],
    ['Episodes', stats?.stats?.episodes ?? '—', ListVideo],
    ['Community', stats?.stats?.users ?? '—', UserRound],
    ['Total views', stats?.stats?.views ?? '—', CirclePlay],
    ['Downloads', stats?.stats?.downloads ?? '—', ArrowDownToLine]
  ];

  return <div className="admin-page"><div className="admin-heading"><div><span className="eyebrow"><Shield size={13} /> YOUR PUBLISHING STUDIO</span><h1>The story starts here.</h1><p>Manage your catalogue, publish new releases, and see what your audience loves.</p></div><button className="button button-muted button-small" onClick={refreshAll}><Settings size={15} /> Refresh dashboard</button></div>
    <div className="stats-grid">{statsItems.map(([label, value, Icon]) => <div className="stat-card" key={label}><div><span>{label}</span><strong>{value}</strong></div><Icon size={20} /></div>)}</div>
    <div className="admin-tabs">{[['movies', 'Movies', Film], ['series', 'Series & episodes', Tv], ['categories', 'Genres', Sparkles]].map(([key, label, Icon]) => <button key={key} className={tab === key ? 'selected' : ''} onClick={() => { setTab(key); setError(''); }}><Icon size={15} /> {label}</button>)}</div>
    {error && <div className="notice notice-error">{error}</div>}{notice && <div className="notice">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={14} /></button></div>}
    {tab === 'movies' && <div className="admin-layout"><section className="admin-panel"><span className="eyebrow">PUBLISH A FILM</span><h2>Make a little movie magic.</h2><p>Add a title, upload the art, and when you're ready, make it live.</p><form className="admin-form" onSubmit={submitMovie}><div className="form-grid"><label>Title<input name="title" required placeholder="The quiet after" /></label><label>URL slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="the-quiet-after" /></label><label>Year<input name="release_year" type="number" min="1888" max="2200" placeholder="2026" /></label><label>Duration (minutes)<input name="duration_minutes" type="number" min="1" placeholder="108" /></label><label>Rating (0–10)<input name="rating" type="number" min="0" max="10" step=".1" placeholder="8.2" /></label><label>Age rating<input name="age_rating" maxLength="12" placeholder="PG-13" /></label></div><label>Short description<textarea name="description" required rows="4" placeholder="Tell people what makes this one worth their time." /></label><div className="form-grid"><label>Director<input name="director" placeholder="Director name" /></label><label>Cast <small>Separate names with commas</small><input name="cast" placeholder="Actor One, Actor Two" /></label></div><CategoryChecks items={categoryData?.items || []} /><div className="form-grid file-fields"><label>Poster image<input name="poster" type="file" accept="image/jpeg,image/png,image/webp,image/avif" /></label><label>Background banner<input name="banner" type="file" accept="image/jpeg,image/png,image/webp,image/avif" /></label><label>Video file<input name="video" type="file" accept="video/mp4,video/webm,video/quicktime" /><small>Private upload · MP4, WebM, MOV</small></label></div><div className="checkbox-row"><label><input name="is_published" type="checkbox" /> Publish this film</label><label><input name="downloads_enabled" type="checkbox" /> Allow downloads</label></div><button className="button button-primary" disabled={busy}><Plus size={16} /> {busy ? 'Adding your film…' : 'Add film to catalogue'}</button></form></section><section className="admin-panel"><span className="eyebrow">YOUR CATALOGUE</span><h2>Films, at a glance.</h2><div className="admin-table">{movieData?.items?.map((movie) => <div className="admin-title-row" key={movie.id}><div className="title-thumb" style={{ backgroundImage: `url("${movie.poster_url || fallbackBackdrop}")` }} /><div className="admin-title-name"><strong>{movie.title}</strong><span>{movie.release_year || 'Year not set'} · {movie.is_published ? 'Live' : 'Unpublished'}</span></div><button className="table-action" onClick={() => publishTitle(movie)} title={movie.is_published ? 'Unpublish' : 'Publish'}>{movie.is_published ? <BadgeCheck size={17} /> : <Play size={16} />}</button><button className="table-action danger" onClick={() => deleteTitle('movies', movie.id)} title="Delete title"><X size={16} /></button></div>)}{!movieData?.items?.length && <p className="empty-inline">Your catalogue starts with one good story.</p>}</div></section></div>}
    {tab === 'series' && <div className="admin-layout"><section className="admin-panel"><span className="eyebrow">PUBLISH A SERIES</span><h2>Give them another episode.</h2><form className="admin-form" onSubmit={submitSeries}><div className="form-grid"><label>Series title<input name="title" required /></label><label>URL slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label><label>Release year<input name="release_year" type="number" min="1888" max="2200" /></label><label>Rating<input name="rating" type="number" min="0" max="10" step=".1" /></label></div><label>Description<textarea name="description" required rows="4" /></label><label>Cast <small>Separate names with commas</small><input name="cast" /></label><CategoryChecks items={categoryData?.items || []} /><div className="form-grid file-fields"><label>Poster<input name="poster" type="file" accept="image/*" /></label><label>Banner<input name="banner" type="file" accept="image/*" /></label></div><label className="checkbox-line"><input name="is_published" type="checkbox" /> Publish this series</label><button className="button button-primary" disabled={busy}><Plus size={16} /> Add series</button></form></section><section className="admin-panel"><span className="eyebrow">SEASONS & EPISODES</span><h2>Build out the next chapter.</h2>{seriesData?.items?.map((series) => <div className="season-editor" key={series.id}><strong>{series.title}</strong><form onSubmit={(event) => addSeason(event, series)}><label>Season #<input name="season_number" type="number" required min="1" /></label><label>Season title<input name="title" placeholder="Optional" /></label><button className="button button-muted button-small"><Plus size={14} /> Add season</button></form></div>)}<form className="admin-form episode-form" onSubmit={addEpisode}><h3>Add episode</h3><label>Season<select name="season_id" required defaultValue="">{seriesData?.items?.map((series) => <optgroup key={series.id} label={series.title}><option value="" disabled>Select a season below</option></optgroup>)}{seriesData?.items?.map((series) => <option key={`${series.id}-placeholder`} value="" disabled>{series.title} — create a season above</option>)}</select><small>Season IDs can be entered in your database; add a dedicated season selector next.</small></label><div className="form-grid"><label>Episode #<input name="episode_number" type="number" required min="1" /></label><label>Episode title<input name="title" required /></label><label>Duration (min)<input name="duration_minutes" type="number" min="1" /></label><label>Video<input name="video" type="file" accept="video/mp4,video/webm,video/quicktime" /></label></div><label>Description<textarea name="description" rows="3" /></label><div className="checkbox-row"><label><input name="is_published" type="checkbox" /> Publish episode</label><label><input name="downloads_enabled" type="checkbox" /> Allow downloads</label></div><button className="button button-primary"><Plus size={15} /> Add episode</button></form></section></div>}
    {tab === 'categories' && <div className="admin-panel category-admin"><span className="eyebrow">THE COLLECTION</span><h2>Genres set the mood.</h2><form className="category-create" onSubmit={addCategory}><label>Genre<input name="name" required placeholder="e.g. Mystery" /></label><label>URL slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="mystery" /></label><button className="button button-primary"><Plus size={16} /> Add genre</button></form><div className="genre-admin-list">{categoryData?.items?.map((category) => <span key={category.id}>{category.name}<small>/{category.slug}</small></span>)}</div></div>}
  </div>;
}

function CategoryChecks({ items }) {
  return <fieldset className="category-checks"><legend>Genres</legend>{items.map((item) => <label key={item.id}><input type="checkbox" name="category_ids" value={item.id} />{item.name}</label>)}</fieldset>;
}

function InfoPage({ title }) { return <div className="info-page"><span className="eyebrow">A NOTE FROM SANSARFILMS HUB</span><h1>{title}</h1><p>We believe a great story can turn an ordinary evening into something worth remembering. SANSARFILMS HUB is a home for thoughtful films and series, built to make finding your next favorite feel as good as watching it.</p><p>Our collection is published by the people who make it. Every title deserves to be here, and every viewer deserves a calmer way to find it.</p><Link className="button button-primary" to="/discover">Find a story <ArrowRight size={16} /></Link></div>; }

function SupportPage() {
  return <div className="support-page">
    <PageIntro label="SANSARFILMS HUB" title="Support & Contact" description="Ukeneye ubundi bufasha cyangwa igitekerezo? Watwandikira." />
    <section className="support-section">
      <span className="eyebrow">WHEN YOU NEED ANOTHER HELP</span>
      <div className="support-contact-grid">
        <article className="support-contact-card">
          <MessageCircle size={20} /><h2>WhatsApp</h2><p>Chat with our support team directly.</p>
          <a className="button button-primary" href="https://whatsapp.com/channel/0029VbAK2dILdQebzEBD113v" target="_blank" rel="noreferrer">Open WhatsApp <ArrowRight size={15} /></a>
        </article>
        <article className="support-contact-card">
          <Mail size={20} /><h2>Email</h2><p>Send us an email for detailed inquiries.</p>
          <a className="button button-muted" href="mailto:mugishasalvon@gmail.com">Send Email <ArrowRight size={15} /></a>
        </article>
        <article className="support-contact-card">
          <Phone size={20} /><h2>Call Support</h2><p>Available during business hours.</p>
          <a href="tel:0796234825" className="support-phone">0796234825</a>
          <a className="button button-muted" href="tel:0796234825">Call Now <ArrowRight size={15} /></a>
        </article>
      </div>
    </section>
    <section className="support-section copyright-section">
      <span className="eyebrow">COPYRIGHT INFORMATION</span>
      <h2>Respecting intellectual property</h2>
      <p>SANSARFILMS HUB respects the intellectual property rights of others. If you believe copyrighted material has been used in a way that constitutes infringement, contact us with:</p>
      <ol>
        <li><strong>Identification of the copyrighted work</strong><span>Describe the work you believe has been infringed.</span></li>
        <li><strong>The URL where the material is located</strong><span>Include the exact URL or URLs where the material appears.</span></li>
        <li><strong>Your contact details</strong><span>Provide your name, address, telephone number, and email address.</span></li>
        <li><strong>A statement that the information is accurate</strong><span>Include a good-faith statement that the use is not authorized by the copyright owner, its agent, or the law.</span></li>
      </ol>
      <div className="copyright-next-card">
        <h3>What happens next</h3>
        <p>After receiving a complete notice, we will review the report and take appropriate action, including removing the material when warranted.</p>
      </div>
    </section>
    <section className="support-section support-hours">
      <span className="eyebrow">OTHER WAYS TO GET SUPPORT</span>
      <div className="support-hours-grid">
        <div><h2>Response time</h2><ul><li>WhatsApp: Within 24 hours</li><li>Email: 24–48 hours</li><li>Phone: During business hours</li></ul></div>
        <div><h2>Business hours</h2><ul><li>Monday–Friday: 8:00 AM–6:00 PM</li><li>Saturday: 9:00 AM–4:00 PM</li><li>Sunday: Emergency support only</li></ul></div>
      </div>
    </section>
  </div>;
}

function TermsPage() {
  return <div className="support-page">
    <PageIntro label="SANSARFILMS HUB" title="Terms & Conditions" description="Effective Date: October 3, 2025" />
    <section className="support-section">
      <p>By accessing SANSARFILMS HUB, you agree to the following Terms &amp; Conditions. Please read them carefully.</p>
    </section>
    <section className="support-section">
      <span className="eyebrow">1. ACCEPTANCE OF TERMS</span>
      <h2>Acceptance of Terms</h2>
      <p>Using our site means you accept these terms. If you do not agree, please do not use our services.</p>
    </section>
    <section className="support-section">
      <span className="eyebrow">2. USE OF CONTENT</span>
      <h2>Use of Content</h2>
      <p>All content is provided for educational and cultural purposes. You may not copy, distribute, or modify content without permission unless covered by Fair Use.</p>
    </section>
    <section className="support-section">
      <span className="eyebrow">3. INTELLECTUAL PROPERTY</span>
      <h2>Intellectual Property</h2>
      <p>All original content, branding, and visuals are property of SANSARFILMS HUB unless otherwise stated. Translated content remains the property of original creators.</p>
    </section>
    <section className="support-section">
      <span className="eyebrow">4. FAIR USE DISCLAIMER</span>
      <h2>Fair Use Disclaimer</h2>
      <p>We use limited excerpts of international agasobanuye for non-commercial, educational purposes. We respect copyright holders and welcome direct communication for resolution.</p>
    </section>
    <section className="support-section">
      <span className="eyebrow">5. USER CONDUCT</span>
      <h2>User Conduct</h2>
      <p>You agree not to:</p>
      <ul className="privacy-list">
        <li>Post harmful, illegal, or infringing content.</li>
        <li>Violate copyright or trademark laws.</li>
        <li>Misuse our platform for unauthorized purposes.</li>
      </ul>
    </section>
    <section className="support-section">
      <span className="eyebrow">6. LIMITATION OF LIABILITY</span>
      <h2>Limitation of Liability</h2>
      <p>SANSARFILMS HUB is not liable for any damages resulting from use of the site, including data loss, service interruption, or third-party content.</p>
    </section>
    <section className="support-section">
      <span className="eyebrow">7. MODIFICATIONS</span>
      <h2>Modifications</h2>
      <p>We may update these Terms at any time. Continued use of the site means you accept the changes.</p>
    </section>
    <section className="support-section">
      <span className="eyebrow">8. GOVERNING LAW</span>
      <h2>Governing Law</h2>
      <p>These Terms are governed by the laws of Rwanda and applicable international copyright regulations.</p>
    </section>
    <section className="support-section">
      <span className="eyebrow">9. CONTACT US</span>
      <h2>Contact Us</h2>
      <ul className="privacy-list">
        <li>email <a href="mailto:mugishasalvon@gmail.com">mugishasalvon@gmail.com</a></li>
        <li>phone <a href="tel:0796234825">0796234825</a></li>
      </ul>
    </section>
  </div>;
}

function PrivacyPage() {
  return <div className="support-page privacy-page">
    <PageIntro label="SANSARFILMS HUB" title="Privacy Policy" description="Protecting your privacy is important to us. This policy explains what information SANSARFILMS HUB handles and how it is used." />
    <section className="support-section">
      <span className="eyebrow">OUR COMMITMENT</span>
      <h2>Respecting your privacy</h2>
      <p>We use information only as needed to operate, secure, and improve the service. We do not sell your personal information. Access to account information is limited to people who need it to operate and support SANSARFILMS HUB.</p>
    </section>
    <section className="support-section">
      <span className="eyebrow">INFORMATION WE HANDLE</span>
      <h2>Data we collect</h2>
      <div className="privacy-cards">
        <article><h3>Account information</h3><p>For enabled accounts, we store your name, email address, account role, and a securely hashed password. We do not store your password in plain text.</p></article>
        <article><h3>Content preferences and activity</h3><p>If you use account features, we store your watchlist, ratings, and playback progress so those features work. We also maintain aggregate movie and episode view counts.</p></article>
        <article><h3>Technical information</h3><p>Your browser sends technical information when connecting to the service. Our hosting or infrastructure providers may process connection or diagnostic logs to deliver and secure the site.</p></article>
      </div>
      <p>We do not ask users to provide payment-card or sensitive personal information through this site.</p>
    </section>
    <section className="support-section">
      <span className="eyebrow">HOW WE USE INFORMATION</span>
      <h2>Use of your data</h2>
      <ul className="privacy-list">
        <li>Authenticate accounts and maintain sign-in sessions.</li>
        <li>Save watchlists, ratings, and playback progress requested through account features.</li>
        <li>Operate, troubleshoot, protect, and improve the service and its content delivery.</li>
        <li>Respond to support requests and comply with applicable legal obligations.</li>
      </ul>
    </section>
    <section className="support-section">
      <span className="eyebrow">COOKIES</span>
      <h2>Cookie policy</h2>
      <p>SANSARFILMS HUB uses a necessary, HTTP-only sign-in cookie to keep an administrator authenticated. It is not used by the app as an advertising cookie. You can clear cookies in your browser, though doing so may sign you out.</p>
    </section>
    <section className="support-section">
      <span className="eyebrow">SHARING AND SECURITY</span>
      <h2>Data sharing and protection</h2>
      <p>We do not sell your personal information. Information may be processed by hosting, database, or media-delivery providers as needed to run the service, or disclosed where required by law or necessary to protect the service and its users.</p>
      <p>Passwords are stored as hashes, and the production sign-in cookie is configured as secure and HTTP-only. No online service can guarantee absolute security, but we take reasonable steps to protect information handled by the application.</p>
    </section>
    <section className="support-section">
      <span className="eyebrow">YOUR CHOICES</span>
      <h2>Questions or account requests?</h2>
      <p>For questions, access or correction requests, or concerns about information associated with an account, contact us at <a href="mailto:mugishasalvon@gmail.com">mugishasalvon@gmail.com</a>. We may need to verify your request before acting on it.</p>
    </section>
    <section className="support-section">
      <span className="eyebrow">POLICY UPDATES</span>
      <h2>Changes to this policy</h2>
      <p>We may update this policy as the service changes. The current version will be posted on this page.</p>
      <p className="privacy-effective-date">Effective date: November 10, 2026</p>
    </section>
  </div>;
}

function LoadingPage() { return <div className="full-loading"><span className="loader" /><span>Getting your story ready…</span></div>; }
function ErrorPage({ message }) { return <div className="state-box error-page"><Info size={25} /><p>{message}</p><Link className="button button-muted" to="/">Back home <ArrowRight size={15} /></Link></div>; }
function NotFound() { return <ErrorPage message="We couldn't find that page. It may have wandered off to another story." />; }

export default App;
