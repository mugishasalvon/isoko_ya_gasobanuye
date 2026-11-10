import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownToLine, ArrowRight, BadgeCheck, ChevronDown, Film, FolderOpen, ImagePlus, ListVideo, Pencil, Plus, Settings, Shield,
  Sparkles, Trash2, Tv, UserRound, X
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, assetUrl, getErrorMessage } from './api.js';
import { useAuth } from './auth.jsx';

function useAdminData(path, enabled) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const { data: result } = await api.get(path);
      setData(result);
      setError('');
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [enabled, path]);
  useEffect(() => { refresh(); }, [refresh]);
  return { data, loading, error, refresh };
}

function parseList(value) {
  try { return Array.isArray(value) ? value : JSON.parse(value || '[]'); } catch { return []; }
}

function createVideoThumbnail(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    let seeking = false;
    let completed = false;
    const finish = (error, thumbnail) => {
      if (completed) return;
      completed = true;
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute('src');
      video.load();
      if (error) reject(error);
      else resolve(thumbnail);
    };
    const capture = () => {
      if (completed || seeking) return;
      const canvas = document.createElement('canvas');
      if (!video.videoWidth || !video.videoHeight) {
        finish(new Error('Could not capture a frame from this video. Try a different video file.'));
        return;
      }
      const scale = Math.min(1, 1280 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const context = canvas.getContext('2d');
      if (!context) {
        finish(new Error('Could not create an image from this video.'));
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) {
          finish(new Error('Could not create an episode thumbnail from this video.'));
          return;
        }
        finish(null, new File([blob], 'episode-thumbnail.jpg', { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.85);
    };

    video.muted = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.addEventListener('loadedmetadata', () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        finish(new Error('Could not read the duration of this video to create its thumbnail.'));
        return;
      }
      if (video.duration > 0.1) {
        seeking = true;
        video.addEventListener('seeked', () => {
          seeking = false;
          capture();
        }, { once: true });
        video.currentTime = Math.min(1, video.duration / 10);
      }
    }, { once: true });
    video.addEventListener('loadeddata', capture, { once: true });
    video.addEventListener('error', () => {
      finish(new Error('Could not read this video to create its thumbnail. Try a different video file.'));
    }, { once: true });
    video.src = objectUrl;
  });
}

function MoviePosterField({ movie }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const currentPoster = assetUrl(movie?.poster_url);
  const image = previewUrl || currentPoster;
  return <label>Poster image
    <input name="poster" type="file" accept="image/jpeg,image/png,image/webp,image/avif"
      onChange={(event) => setFile(event.target.files?.[0] || null)} />
    {image && <img className="admin-poster-preview" src={image}
      alt={file ? 'Selected poster preview' : 'Current movie poster'} />}
    <small>{file ? 'Previewing the new poster; save the film to upload it.' : movie?.poster_url ? 'Current poster. Choose a file to replace it.' : 'Choose an image file to use as the movie cover.'}</small>
  </label>;
}

function TranslatorAvatarField({ translator }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const currentImage = assetUrl(translator?.image_url);
  const image = previewUrl || currentImage;
  return <label>Profile photo
    <input name="translator_avatar" type="file" accept="image/jpeg,image/png,image/webp,image/avif"
      onChange={(event) => setFile(event.target.files?.[0] || null)} />
    {image && <img className="admin-translator-preview" src={image}
      alt={file ? 'Selected translator profile photo preview' : 'Current translator profile photo'} />}
    <small>{file ? 'Previewing the new photo; save the profile to upload it.' : currentImage ? 'Current photo. Choose a file to replace it.' : 'Optional JPG, PNG, WebP, or AVIF portrait.'}</small>
  </label>;
}

function AdminDashboard() {
  const { user, loading: authLoading } = useAuth();
  const enabled = user?.role === 'admin';
  const stats = useAdminData('/admin/stats', enabled);
  const movies = useAdminData('/admin/movies', enabled);
  const series = useAdminData('/admin/series', enabled);
  const seasons = useAdminData('/admin/seasons', enabled);
  const episodes = useAdminData('/admin/episodes', enabled);
  const categories = useAdminData('/content/categories', enabled);
  const translators = useAdminData('/admin/translators', enabled);
  const [tab, setTab] = useState('movies');
  const [openUploadedKey, setOpenUploadedKey] = useState(null);
  const [editingMovie, setEditingMovie] = useState(null);
  const [selectedTranslatorId, setSelectedTranslatorId] = useState('');
  const [editingTranslator, setEditingTranslator] = useState(null);
  const [editingSeries, setEditingSeries] = useState(null);
  const [selectedSeriesTranslatorId, setSelectedSeriesTranslatorId] = useState('');
  const [editingEpisode, setEditingEpisode] = useState(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [seasonFormSeriesId, setSeasonFormSeriesId] = useState(null);
  const [episodeFormOpen, setEpisodeFormOpen] = useState(false);
  const [expandedEpisodeSeriesId, setExpandedEpisodeSeriesId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refreshAll = async () => {
    await Promise.all([
      stats.refresh(), movies.refresh(), series.refresh(), seasons.refresh(),
      episodes.refresh(), categories.refresh(), translators.refresh()
    ]);
  };
  const notifyError = (requestError) => setError(getErrorMessage(requestError));
  const startEditingMovie = (movie) => {
    setEditingMovie(movie);
    setSelectedTranslatorId(String(movie.subtitle_translator_id || ''));
    setTab('movies');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const startEditingSeries = (item) => {
    setEditingSeries(item);
    setSelectedSeriesTranslatorId(String(item.subtitle_translator_id || ''));
    setTab('series');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveMovie = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true); setError(''); setNotice('');
    const values = Object.fromEntries(new FormData(form).entries());
    values.cast = JSON.stringify(values.cast.split(',').map((name) => name.trim()).filter(Boolean));
    values.category_ids = JSON.stringify([...form.querySelectorAll('[name="category_ids"]:checked')]
      .map((input) => Number(input.value)));
    values.is_published = String(values.is_published === 'on');
    values.downloads_enabled = String(values.downloads_enabled === 'on');
    ['poster', 'banner', 'translator_avatar', 'video', 'video_480p', 'video_720p', 'video_1080p'].forEach((key) => delete values[key]);
    const body = new FormData();
    Object.entries(values).forEach(([key, value]) => body.append(key, value));
    ['poster', 'banner', 'translator_avatar', 'video', 'video_480p', 'video_720p', 'video_1080p'].forEach((key) => {
      const file = form.elements[key]?.files[0];
      if (file) body.append(key, file);
    });
    try {
      const id = editingMovie?.id;
      await api.request({
        method: id ? 'put' : 'post',
        url: id ? `/admin/movies/${id}` : '/admin/movies',
        data: body
      });
      form.reset();
      setEditingMovie(null);
      setSelectedTranslatorId('');
      setNotice(id ? 'Film details updated.' : 'Film added to the catalogue.');
      await refreshAll();
    } catch (requestError) { notifyError(requestError); }
    finally { setBusy(false); }
  };

  const saveTranslator = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true); setError(''); setNotice('');
    try {
      const id = editingTranslator?.id;
      await api.request({
        method: id ? 'put' : 'post',
        url: id ? `/admin/translators/${id}` : '/admin/translators',
        data: new FormData(form)
      });
      form.reset();
      setEditingTranslator(null);
      setNotice(id ? 'Translator profile updated.' : 'Translator profile created.');
      await refreshAll();
    } catch (requestError) { notifyError(requestError); }
    finally { setBusy(false); }
  };

  const deleteTranslator = async (translator) => {
    if (!window.confirm(`Delete translator profile â€œ${translator.name}â€?`)) return;
    try {
      await api.delete(`/admin/translators/${translator.id}`);
      setNotice('Translator profile deleted.');
      await refreshAll();
    } catch (requestError) { notifyError(requestError); }
  };

  const saveSeries = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true); setError(''); setNotice('');
    const values = Object.fromEntries(new FormData(form).entries());
    values.cast = JSON.stringify(values.cast.split(',').map((name) => name.trim()).filter(Boolean));
    values.category_ids = JSON.stringify([...form.querySelectorAll('[name="category_ids"]:checked')]
      .map((input) => Number(input.value)));
    values.is_published = String(values.is_published === 'on');
    ['poster', 'banner'].forEach((key) => delete values[key]);
    const body = new FormData();
    Object.entries(values).forEach(([key, value]) => body.append(key, value));
    ['poster', 'banner'].forEach((key) => {
      const file = form.elements[key]?.files[0];
      if (file) body.append(key, file);
    });
    try {
      const id = editingSeries?.id;
      const { data } = await api.request({
        method: id ? 'put' : 'post',
        url: id ? `/admin/series/${id}` : '/admin/series',
        data: body
      });
      if (!id) setSelectedSeasonId(String(data.season_id));
      form.reset();
      setEditingSeries(null);
      setSelectedSeriesTranslatorId('');
      setNotice(id ? 'Series details updated.' : `Series created with ${data.season_count} season${data.season_count === 1 ? '' : 's'} and ${data.episodes_per_season} episode drafts per season.`);
      await refreshAll();
    } catch (requestError) { notifyError(requestError); }
    finally { setBusy(false); }
  };

  const saveEpisode = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true); setError(''); setNotice('');
    const values = Object.fromEntries(new FormData(form).entries());
    const { season_id: seasonId, video, video_480p, video_720p, video_1080p, ...episode } = values;
    episode.is_published = String(episode.is_published === 'on');
    episode.downloads_enabled = String(episode.downloads_enabled === 'on');
    const body = new FormData();
    Object.entries(episode).forEach(([key, value]) => body.append(key, value));
    ['video', 'video_480p', 'video_720p', 'video_1080p'].forEach((key) => {
      if (form.elements[key]?.files[0]) body.append(key, form.elements[key].files[0]);
    });
    try {
      if (form.elements.video.files[0]) {
        body.append('thumbnail', await createVideoThumbnail(form.elements.video.files[0]));
      }
      await api.request({
        method: editingEpisode ? 'put' : 'post',
        url: editingEpisode ? `/admin/episodes/${editingEpisode.id}` : `/admin/seasons/${selectedSeasonId || seasonId}/episodes`,
        data: body
      });
      form.reset();
      setEditingEpisode(null);
      setSelectedSeasonId('');
      setEpisodeFormOpen(false);
      setNotice(editingEpisode ? 'Episode details updated.' : 'Episode added.');
      await refreshAll();
    } catch (requestError) { notifyError(requestError); }
    finally { setBusy(false); }
  };

  const togglePublished = async (type, item) => {
    try {
      await api.put(`/admin/${type}/${item.id}/publish`, { is_published: !item.is_published });
      setNotice(`${item.title} is now ${item.is_published ? 'unpublished' : 'published'}.`);
      await refreshAll();
    } catch (requestError) { notifyError(requestError); }
  };
  const deleteContent = async (type, item) => {
    if (!window.confirm(`Delete â€œ${item.title}â€? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/${type}/${item.id}`);
      setNotice('Catalogue item deleted.');
      await refreshAll();
    } catch (requestError) { notifyError(requestError); }
  };
  const deleteSeason = async (season) => {
    const name = `${season.series_title} Â· Season ${season.season_number}`;
    if (!window.confirm(`Delete ${name} and all its episodes? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/seasons/${season.id}`);
      setNotice(`${name} deleted.`);
      await refreshAll();
    } catch (requestError) { notifyError(requestError); }
  };

  const addSeason = async (event, item) => {
    event.preventDefault();
    try {
      const form = event.currentTarget;
      const values = Object.fromEntries(new FormData(form).entries());
      const { data } = await api.post(`/admin/series/${item.id}/seasons`, new FormData(form));
      setSelectedSeasonId(String(data.id));
      setSeasonFormSeriesId(null);
      form.reset();
      setNotice(`Season added to ${item.title} with ${values.episode_count || 0} episode drafts.`);
      await refreshAll();
    } catch (requestError) { notifyError(requestError); }
  };
  const saveSeasonPoster = async (event, season) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await api.put(`/admin/seasons/${season.id}`, new FormData(form));
      form.reset();
      setNotice(`Poster updated for ${season.series_title} Â· Season ${season.season_number}.`);
      await seasons.refresh();
    } catch (requestError) { notifyError(requestError); }
  };
  const deleteCategory = async (category) => {
    if (!window.confirm(`Delete the ${category.name} genre?`)) return;
    try {
      await api.delete(`/admin/categories/${category.id}`);
      await categories.refresh();
      setNotice('Genre deleted.');
    } catch (requestError) { notifyError(requestError); }
  };
  const editCategory = async (category) => {
    const name = window.prompt('Edit genre name:', category.name)?.trim();
    if (!name) return;
    const generatedSlug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const slug = window.prompt('Edit genre URL slug:', generatedSlug)?.trim();
    if (!slug) return;
    try {
      await api.put(`/admin/categories/${category.id}`, { name, slug });
      await categories.refresh();
      setNotice('Genre updated.');
    } catch (requestError) { notifyError(requestError); }
  };
  const saveCategory = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await api.post('/admin/categories', Object.fromEntries(new FormData(form).entries()));
      form.reset();
      await categories.refresh();
      setNotice('Genre created.');
    } catch (requestError) { notifyError(requestError); }
  };
  const uploadSubtitle = async (event, type, id) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await api.post(`/admin/${type}/${id}/subtitles`, new FormData(form));
      form.reset();
      setNotice('Subtitle track added.');
      await refreshAll();
    } catch (requestError) { notifyError(requestError); }
  };
  const deleteSubtitle = async (subtitle) => {
    try {
      await api.delete(`/admin/subtitles/${subtitle.id}`);
      await refreshAll();
      setNotice('Subtitle track removed.');
    } catch (requestError) { notifyError(requestError); }
  };

  if (authLoading) return <div className="gate-page"><span className="loader" /><p>Checking administrator accessâ€¦</p></div>;
  if (!user) return <div className="gate-page"><Shield size={30} /><h1>Administrator sign-in is required.</h1><Link to="/login" className="button button-primary">Admin sign in</Link></div>;
  if (user.role !== 'admin') return <div className="state-box error-page"><Shield size={25} /><p>Administrator access is required.</p><Link className="button button-muted" to="/">Back home</Link></div>;

  const statsList = [
    ['Movies', stats.data?.stats?.movies ?? 'â€”', Film],
    ['Series', stats.data?.stats?.series ?? 'â€”', Tv],
    ['Episodes', stats.data?.stats?.episodes ?? 'â€”', ListVideo],
    ['Users', stats.data?.stats?.users ?? 'â€”', UserRound],
    ['Views', stats.data?.stats?.views ?? 'â€”', Film],
    ['Downloads', stats.data?.stats?.downloads ?? 'â€”', ArrowDownToLine]
  ];
  const dashboardSections = [
    ['uploaded', 'Uploaded', FolderOpen],
    ['movies', 'Movies', Film],
    ['series', 'Series & episodes', Tv],
    ['categories', 'Genres', Sparkles],
    ['translators', 'Subtitle translators', UserRound]
  ];

  return <div className="admin-page">
    <div className="admin-heading">
      <div><span className="eyebrow"><Shield size={13} /> YOUR PUBLISHING STUDIO</span><h1>The story starts here.</h1><p>Manage your catalogue, publish new releases, and see what your audience loves.</p></div>
      <button className="button button-muted button-small" onClick={refreshAll}><Settings size={15} /> Refresh dashboard</button>
    </div>
    <div className="stats-grid">{statsList.map(([label, value, Icon]) => <div className="stat-card" key={label}><div><span>{label}</span><strong>{value}</strong></div><Icon size={20} /></div>)}</div>
    {error && <div className="notice notice-error">{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={14} /></button></div>}
    {movies.error && <div className="notice notice-error">{movies.error}</div>}
    {notice && <div className="notice">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={14} /></button></div>}

    <div className="admin-workspace">
      <aside className="admin-sidebar" aria-label="Dashboard sections">
        <span className="admin-sidebar-label">WORKSPACE</span>
        <nav className="admin-sidebar-nav">
          {dashboardSections.map(([key, label, Icon]) => <button key={key}
            className={tab === key ? 'selected' : ''}
            aria-current={tab === key ? 'page' : undefined}
            onClick={() => { setTab(key); setError(''); }}>
            <Icon size={17} /><span>{label}</span><ArrowRight className="admin-sidebar-arrow" size={14} />
          </button>)}
        </nav>
      </aside>
      <div className="admin-section-content">
    {tab === 'uploaded' && <section className="admin-panel uploaded-panel">
      <span className="eyebrow">CONTENT LIBRARY</span><h2>Uploaded content</h2>
      <p>Manage uploaded movies and seasons. Click a title to open actions and perform updates.</p>
      {seasons.error && <div className="notice notice-error">{seasons.error}</div>}
      <div className="uploaded-blocks">
        {movies.data?.items?.map((movie) => {
          const key = `movie-${movie.id}`;
          const open = openUploadedKey === key;
          return <article className={`uploaded-block ${open ? 'open' : ''}`} key={key}>
            <button type="button" className="uploaded-block-head" onClick={() => setOpenUploadedKey(open ? null : key)} aria-expanded={open}>
              <div className="uploaded-block-title">
                <div className="title-thumb" style={movie.poster_url ? { backgroundImage: `url("${assetUrl(movie.poster_url)}")` } : undefined} />
                <div><strong>{movie.title}</strong><span>Movie · {movie.release_year || 'Year not set'} · {movie.is_published ? 'Live' : 'Unpublished'}</span></div>
              </div>
              <ChevronDown size={16} className="uploaded-block-chevron" />
            </button>
            {open && <div className="uploaded-block-form">
              <div className="uploaded-block-actions">
                <button type="button" className="button button-muted button-small" onClick={() => startEditingMovie(movie)}><Pencil size={14} /> Edit details / poster</button>
                <button type="button" className="button button-muted button-small" onClick={() => togglePublished('movies', movie)}><BadgeCheck size={14} /> {movie.is_published ? 'Unpublish' : 'Publish'}</button>
                <button type="button" className="button button-muted button-small danger-text" onClick={() => deleteContent('movies', movie)}><Trash2 size={14} /> Delete</button>
              </div>
            </div>}
          </article>;
        })}
        {seasons.data?.items?.map((season) => {
          const key = `season-${season.id}`;
          const open = openUploadedKey === key;
          return <article className={`uploaded-block ${open ? 'open' : ''}`} key={key}>
            <button type="button" className="uploaded-block-head" onClick={() => setOpenUploadedKey(open ? null : key)} aria-expanded={open}>
              <div className="uploaded-block-title">
                <div className="season-poster-thumb" style={season.poster_url ? { backgroundImage: `url("${assetUrl(season.poster_url)}")` } : undefined} />
                <div><strong>{season.series_title} · Season {season.season_number}</strong><span>Season · Part of series</span></div>
              </div>
              <ChevronDown size={16} className="uploaded-block-chevron" />
            </button>
            {open && <div className="uploaded-block-form">
              <form className="uploaded-inline-form" onSubmit={(event) => saveSeasonPoster(event, season)}>
                <label>Season poster<input name="poster" type="file" accept="image/jpeg,image/png,image/webp,image/avif" required /></label>
                <div className="uploaded-block-actions">
                  <button className="button button-primary button-small"><ImagePlus size={14} /> {season.poster_url ? 'Change poster' : 'Add poster'}</button>
                  <button type="button" className="button button-muted button-small danger-text" onClick={() => deleteSeason(season)}><Trash2 size={14} /> Delete season</button>
                </div>
              </form>
            </div>}
          </article>;
        })}
        {(movies.loading || seasons.loading) && <p className="empty-inline">Loading uploaded content…</p>}
        {!movies.loading && !seasons.loading && !movies.data?.items?.length && !seasons.data?.items?.length && <p className="empty-inline">No movies or seasons have been uploaded yet.</p>}
      </div>
    </section>}
    {tab === 'movies' && <div className="admin-layout">
      <section className="admin-panel">
        <span className="eyebrow">{editingMovie ? 'EDIT YOUR FILM' : 'PUBLISH A FILM'}</span><h2>{editingMovie ? 'Every detail, just right.' : 'Make a little movie magic.'}</h2><p>{editingMovie ? `Editing ${editingMovie.title}.` : 'Add a title, upload the art, and when youâ€™re ready, make it live.'}</p>
        <form className="admin-form" key={editingMovie?.id || 'new-movie'} onSubmit={saveMovie}>
          <details className="admin-form-section" open>
            <summary>Film details</summary>
            <div className="form-grid">
              <label>Title<input name="title" required defaultValue={editingMovie?.title || ''} placeholder="The quiet after" /></label>
              <label>URL slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" defaultValue={editingMovie?.slug || ''} placeholder="the-quiet-after" /></label>
              <label>Year<input name="release_year" type="number" min="1888" max="2200" defaultValue={editingMovie?.release_year || ''} /></label>
              <label>Duration (minutes)<input name="duration_minutes" type="number" min="1" defaultValue={editingMovie?.duration_minutes || ''} /></label>
              <label>Rating (0â€“10)<input name="rating" type="number" min="0" max="10" step=".1" defaultValue={editingMovie?.rating || ''} /></label>
              <label>Age rating<input name="age_rating" maxLength="12" defaultValue={editingMovie?.age_rating || ''} placeholder="PG-13" /></label>
            </div>
            <label>Short description<textarea name="description" required rows="4" defaultValue={editingMovie?.description || ''} /></label>
          </details>
          <details className="admin-form-section">
            <summary>Credits and genres</summary>
            <div className="form-grid">
              <label>Director<input name="director" defaultValue={editingMovie?.director || ''} /></label>
              <label>Cast <small>Separate names with commas</small><input name="cast" defaultValue={parseList(editingMovie?.cast).join(', ')} /></label>
              <label>Subtitle translator<select name="subtitle_translator_id" value={selectedTranslatorId} onChange={(event) => setSelectedTranslatorId(event.target.value)}>
                <option value="">No translator assigned</option>
                {translators.data?.items?.map((translator) => <option key={translator.id} value={translator.id}>{translator.name}</option>)}
              </select><small>Create and manage profiles in the Subtitle translators tab.</small></label>
            </div>
            <CategoryChecks items={categories.data?.items || []} selected={parseList(editingMovie?.category_ids)} />
          </details>
          <details className="admin-form-section">
            <summary>Poster, video, and downloads</summary>
            <div className="form-grid file-fields">
              <MoviePosterField key={editingMovie?.id || 'new-poster'} movie={editingMovie} />
              <label>Background banner<input name="banner" type="file" accept="image/jpeg,image/png,image/webp,image/avif" /></label>
              <label className="local-video-upload">Choose movie from your computer<input name="video" type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" /><small>Select an MP4, WebM, or MOV file. It will be uploaded to private server storage.</small></label>
              <label>480p download<input name="video_480p" type="file" accept="video/mp4,video/webm,video/quicktime" /></label>
              <label>720p download<input name="video_720p" type="file" accept="video/mp4,video/webm,video/quicktime" /></label>
              <label>1080p download<input name="video_1080p" type="file" accept="video/mp4,video/webm,video/quicktime" /></label>
            </div>
          </details>
          <div className="checkbox-row">
            <label><input name="is_published" type="checkbox" defaultChecked={Boolean(editingMovie?.is_published)} /> Publish this film</label>
            <label><input name="downloads_enabled" type="checkbox" defaultChecked={Boolean(editingMovie?.downloads_enabled)} /> Allow downloads</label>
          </div>
          <div className="form-button-row"><button className="button button-primary" disabled={busy}><Plus size={16} /> {busy ? 'Savingâ€¦' : editingMovie ? 'Save film changes' : 'Add film to catalogue'}</button>{editingMovie && <button className="button button-muted" type="button" onClick={() => { setEditingMovie(null); setSelectedTranslatorId(''); }}>Cancel edit</button>}</div>
        </form>
      </section>
      <section className="admin-panel"><span className="eyebrow">YOUR CATALOGUE</span><h2>Films, at a glance.</h2><div className="admin-table">
        {movies.loading && <p className="empty-inline">Loading your catalogueâ€¦</p>}
        {movies.data?.items?.map((movie) => <div className="admin-item-wrap" key={movie.id}>
          <div className="admin-title-row">
            <div className="title-thumb" style={{ backgroundImage: `url("${assetUrl(movie.poster_url)}")` }} />
            <div className="admin-title-name"><strong>{movie.title}</strong><span>{movie.release_year || 'Year not set'} Â· {movie.is_published ? 'Live' : 'Unpublished'}</span></div>
            <button className="table-action" onClick={() => startEditingMovie(movie)} aria-label={`Edit ${movie.title}`}><Pencil size={15} /></button>
            <button className="table-action" onClick={() => togglePublished('movies', movie)} aria-label={movie.is_published ? 'Unpublish' : 'Publish'}><BadgeCheck size={17} /></button>
            <button className="table-action danger" onClick={() => deleteContent('movies', movie)} aria-label={`Delete ${movie.title}`}><Trash2 size={15} /></button>
          </div>
          <SubtitleControls item={movie} kind="movies" upload={uploadSubtitle} remove={deleteSubtitle} />
        </div>)}
        {!movies.loading && !movies.data?.items?.length && <p className="empty-inline">Your catalogue starts with one good story.</p>}
      </div></section>
    </div>}

    {tab === 'series' && <div className="admin-layout">
      <section className="admin-panel">
        <span className="eyebrow">{editingSeries ? 'EDIT YOUR SERIES' : 'PUBLISH A SERIES'}</span><h2>{editingSeries ? 'Shape the story.' : 'Give them another episode.'}</h2>
        <form className="admin-form" key={editingSeries?.id || 'new-series'} onSubmit={saveSeries}>
          <details className="admin-form-section" open>
            <summary>Series details</summary>
            <div className="form-grid">
              <label>Series title<input name="title" required defaultValue={editingSeries?.title || ''} /></label>
              <label>URL slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" defaultValue={editingSeries?.slug || ''} /></label>
              <label>Release year<input name="release_year" type="number" min="1888" max="2200" defaultValue={editingSeries?.release_year || ''} /></label>
              <label>Rating<input name="rating" type="number" min="0" max="10" step=".1" defaultValue={editingSeries?.rating || ''} /></label>
            </div>
            {!editingSeries && <div className="form-grid">
              <label>Number of seasons<input name="season_count" type="number" min="1" max="20" defaultValue="1" required /><small>Creates these seasons automatically (maximum 20).</small></label>
              <label>Episodes per season<input name="episodes_per_season" type="number" min="0" max="100" defaultValue="0" required /><small>Creates numbered, unpublished episode drafts to fill in later. Up to 500 drafts total.</small></label>
            </div>}
            <label>Description<textarea name="description" required rows="4" defaultValue={editingSeries?.description || ''} /></label>
          </details>
          <details className="admin-form-section">
            <summary>Credits and genres</summary>
            <div className="form-grid">
              <label>Cast <small>Separate names with commas</small><input name="cast" defaultValue={parseList(editingSeries?.cast).join(', ')} /></label>
              <label>Subtitle translator<select name="subtitle_translator_id" value={selectedSeriesTranslatorId} onChange={(event) => setSelectedSeriesTranslatorId(event.target.value)}>
                <option value="">No translator assigned</option>
                {translators.data?.items?.map((translator) => <option key={translator.id} value={translator.id}>{translator.name}</option>)}
              </select><small>Create and manage profiles in the Subtitle translators tab.</small></label>
            </div>
            <CategoryChecks items={categories.data?.items || []} selected={parseList(editingSeries?.category_ids)} />
          </details>
          <details className="admin-form-section">
            <summary>Poster and banner</summary>
            <div className="form-grid file-fields"><label>Poster<input name="poster" type="file" accept="image/*" /></label><label>Banner<input name="banner" type="file" accept="image/*" /></label></div>
          </details>
          <label className="checkbox-line"><input name="is_published" type="checkbox" defaultChecked={Boolean(editingSeries?.is_published)} /> Publish this series</label>
          <div className="form-button-row"><button className="button button-primary" disabled={busy}><Plus size={16} /> {editingSeries ? 'Save series changes' : 'Add series'}</button>{editingSeries && <button className="button button-muted" type="button" onClick={() => { setEditingSeries(null); setSelectedSeriesTranslatorId(''); }}>Cancel edit</button>}</div>
        </form>
        <div className="admin-table">
          {series.data?.items?.map((item) => <div className="admin-title-row" key={item.id}>
            <div className="admin-title-name"><strong>{item.title}</strong><span>{item.is_published ? 'Live' : 'Unpublished'}{item.subtitle_translator_name ? ` Â· Subtitles by ${item.subtitle_translator_name}` : ''}</span></div>
            <button className="table-action" onClick={() => startEditingSeries(item)} aria-label={`Edit ${item.title}`}><Pencil size={15} /></button>
            <button className="table-action" onClick={() => togglePublished('series', item)} aria-label="Change publishing status"><BadgeCheck size={17} /></button>
            <button className="table-action danger" onClick={() => deleteContent('series', item)} aria-label={`Delete ${item.title}`}><Trash2 size={15} /></button>
          </div>)}
        </div>
      </section>
      <section className="admin-panel">
        <span className="eyebrow">SEASONS & EPISODES</span><h2>Build out the next chapter.</h2>
        <p>Set season and episode counts when creating a series, or add a season and its numbered episode drafts here.</p>
         {series.data?.items?.map((item) => <div className="season-editor" key={item.id}>
          <button className="admin-form-toggle" type="button"
            aria-expanded={seasonFormSeriesId === item.id}
            onClick={() => setSeasonFormSeriesId(seasonFormSeriesId === item.id ? null : item.id)}>
            <Plus size={15} /> {seasonFormSeriesId === item.id ? 'Close season form' : `Add season to ${item.title}`}
          </button>
          {seasonFormSeriesId === item.id && <form onSubmit={(event) => addSeason(event, item)}>
              <label>Season #<input name="season_number" type="number" required min="1" /></label>
              <label>Season title<input name="title" placeholder="Defaults to Season number" /></label>
              <label>Episode drafts<input name="episode_count" type="number" min="0" max="100" defaultValue="0" /><small>Numbered and unpublished</small></label>
              <label>Season poster<input name="poster" type="file" accept="image/jpeg,image/png,image/webp,image/avif" /><small>Optional cover image for this season.</small></label>
              <button className="button button-muted button-small"><Plus size={14} /> Add season</button>
            </form>}
        </div>)}
        {editingEpisode || episodeFormOpen ? <form className="admin-form episode-form" key={editingEpisode?.id || 'new-episode'} onSubmit={saveEpisode}>
            {!editingEpisode && <p>Select a season and episode number. To complete an episode draft, use Edit in the episode list below.</p>}
            <details className="admin-form-section" open>
              <summary>Episode details</summary>
              <label>Season<select name="season_id" required value={editingEpisode?.season_id || selectedSeasonId} onChange={(event) => setSelectedSeasonId(event.target.value)} disabled={Boolean(editingEpisode)}>
                <option value="" disabled>Choose a season</option>
                {seasons.data?.items?.map((season) => <option key={season.id} value={season.id}>{season.series_title} Â· Season {season.season_number}</option>)}
              </select></label>
              <div className="form-grid">
                <label>Episode #<input name="episode_number" type="number" required min="1" defaultValue={editingEpisode?.episode_number || ''} /></label>
                <label>Episode title<input name="title" required defaultValue={editingEpisode?.title || ''} /></label>
                <label>Duration (min)<input name="duration_minutes" type="number" min="1" defaultValue={editingEpisode?.duration_minutes || ''} /></label>
                <label>Release date<input name="release_date" type="date" defaultValue={editingEpisode?.release_date?.slice(0, 10) || ''} /></label>
              </div>
              <label>Description<textarea name="description" rows="3" defaultValue={editingEpisode?.description || ''} /></label>
            </details>
            <details className="admin-form-section">
              <summary>Video and downloads</summary>
              <div className="form-grid">
                <label>Original video<input name="video" type="file" accept="video/mp4,video/webm,video/quicktime" /><small>When saved, an episode thumbnail is automatically captured from this video.</small></label>
                <label>480p download<input name="video_480p" type="file" accept="video/mp4,video/webm,video/quicktime" /></label>
                <label>720p download<input name="video_720p" type="file" accept="video/mp4,video/webm,video/quicktime" /></label>
                <label>1080p download<input name="video_1080p" type="file" accept="video/mp4,video/webm,video/quicktime" /></label>
              </div>
              <label>Trusted HTTPS video URL<input name="external_video_url" type="url" defaultValue={editingEpisode?.external_video_url || ''} placeholder="https://media.example.com/episode.mp4" /><small>Only hosts configured in MEDIA_ALLOWED_HOSTS are accepted.</small></label>
            </details>
            <div className="checkbox-row"><label><input name="is_published" type="checkbox" defaultChecked={Boolean(editingEpisode?.is_published)} /> Publish episode</label><label><input name="downloads_enabled" type="checkbox" defaultChecked={Boolean(editingEpisode?.downloads_enabled)} /> Allow downloads</label></div>
            <div className="form-button-row"><button className="button button-primary" disabled={busy || (!editingEpisode && !selectedSeasonId)}><Plus size={15} /> {editingEpisode ? 'Save episode' : 'Add episode'}</button><button className="button button-muted" type="button" onClick={() => { setEditingEpisode(null); setSelectedSeasonId(''); setEpisodeFormOpen(false); }}>{editingEpisode ? 'Cancel' : 'Close form'}</button></div>
        </form> : <button className="admin-form-toggle episode-form-toggle" type="button"
          disabled={!seasons.data?.items?.length}
          onClick={() => setEpisodeFormOpen(true)}>
          <Plus size={15} /> Add episode
        </button>}
        <div className="admin-table episode-series-list">
          {series.data?.items?.map((item) => {
            const seriesEpisodes = episodes.data?.items?.filter((episode) => Number(episode.series_id) === Number(item.id)) || [];
            const expanded = expandedEpisodeSeriesId === item.id;
            return <section className="episode-series-group" key={item.id}>
              <div className="episode-series-heading">
                <div className="admin-title-name"><strong>{item.title}</strong><span>{seriesEpisodes.length} {seriesEpisodes.length === 1 ? 'episode' : 'episodes'}</span></div>
                <button className="admin-form-toggle" type="button" aria-expanded={expanded}
                  onClick={() => setExpandedEpisodeSeriesId(expanded ? null : item.id)}>
                  {expanded ? 'Hide episodes' : 'View episodes'}
                </button>
              </div>
              {expanded && <div className="episode-series-items">
                {episodes.loading ? <p className="empty-inline">Loading episodesâ€¦</p> : seriesEpisodes.length ? seriesEpisodes.map((episode) => <div className="admin-item-wrap" key={episode.id}>
                  <div className="admin-title-row">
                    <div className="admin-title-name"><strong>{episode.title}</strong><span>Season {episode.season_number} Â· Episode {episode.episode_number} Â· {episode.is_published ? 'Live' : 'Unpublished'}</span></div>
                    <button className="table-action" onClick={() => { setEditingEpisode(episode); setEpisodeFormOpen(true); setExpandedEpisodeSeriesId(item.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} aria-label={`Edit ${episode.title}`}><Pencil size={14} /></button>
                    <button className="table-action" onClick={() => togglePublished('episodes', episode)} aria-label={episode.is_published ? `Unpublish ${episode.title}` : `Publish ${episode.title}`}><BadgeCheck size={16} /></button>
                    <button className="table-action danger" onClick={() => deleteContent('episodes', episode)} aria-label={`Delete ${episode.title}`}><Trash2 size={14} /></button>
                  </div>
                  <SubtitleControls item={episode} kind="episodes" upload={uploadSubtitle} remove={deleteSubtitle} />
                </div>) : <p className="empty-inline">No episodes in this series yet.</p>}
              </div>}
            </section>;
          })}
          {episodes.loading && <p className="empty-inline">Loading episodesâ€¦</p>}
          {!episodes.loading && !series.data?.items?.length && <p className="empty-inline">Add a series to manage its episodes.</p>}
        </div>
      </section>
    </div>}

    {tab === 'categories' && <section className="admin-panel category-admin">
      <span className="eyebrow">THE COLLECTION</span><h2>Genres set the mood.</h2>
      <form className="category-create" onSubmit={saveCategory}>
        <label>Genre<input name="name" required placeholder="e.g. Mystery" /></label>
        <label>URL slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="mystery" /></label>
        <button className="button button-primary"><Plus size={16} /> Add genre</button>
      </form>
      <div className="genre-admin-list">{categories.data?.items?.map((category) => <span key={category.id}>{category.name}<small>/{category.slug}</small><button onClick={() => editCategory(category)} aria-label={`Edit ${category.name}`}><Pencil size={13} /></button><button onClick={() => deleteCategory(category)} aria-label={`Delete ${category.name}`}><Trash2 size={13} /></button></span>)}</div>
    </section>}

    {tab === 'translators' && <div className="admin-layout">
      <section className="admin-panel">
        <span className="eyebrow">{editingTranslator ? 'EDIT PROFILE' : 'NEW PROFILE'}</span>
        <h2>{editingTranslator ? `Update ${editingTranslator.name}.` : 'Create a translator profile.'}</h2>
        <p>Save each translator once, then assign their profile to any movie.</p>
        <form className="admin-form" key={editingTranslator?.id || 'new-translator'} onSubmit={saveTranslator}>
          <label>Translator name<input name="name" required maxLength="240" defaultValue={editingTranslator?.name || ''} placeholder="Full name" /></label>
          <label>About the translator<textarea name="bio" rows="4" maxLength="5000" defaultValue={editingTranslator?.bio || ''} placeholder="Optional profile description" /></label>
          <TranslatorAvatarField key={editingTranslator?.id || 'new-translator-avatar'} translator={editingTranslator} />
          <div className="form-button-row">
            <button className="button button-primary" disabled={busy}><Plus size={16} /> {busy ? 'Savingâ€¦' : editingTranslator ? 'Save profile' : 'Create profile'}</button>
            {editingTranslator && <button className="button button-muted" type="button" onClick={() => setEditingTranslator(null)}>Cancel edit</button>}
          </div>
        </form>
      </section>
      <section className="admin-panel">
        <span className="eyebrow">TRANSLATOR DIRECTORY</span><h2>Profiles</h2>
        {translators.error && <div className="notice notice-error">{translators.error}</div>}
        <div className="translator-admin-list">
          {translators.data?.items?.map((translator) => <article className="translator-admin-card" key={translator.id}>
            {translator.image_url ? <img src={assetUrl(translator.image_url)} alt="" /> : <span className="translator-initial">{translator.name.charAt(0).toUpperCase()}</span>}
            <div><strong>{translator.name}</strong><span>{translator.movie_count} {Number(translator.movie_count) === 1 ? 'movie' : 'movies'} Â· {translator.series_count} series</span>{translator.bio && <p>{translator.bio}</p>}</div>
            <button className="table-action" onClick={() => setEditingTranslator(translator)} aria-label={`Edit ${translator.name}`}><Pencil size={14} /></button>
            <button className="table-action danger" onClick={() => deleteTranslator(translator)} aria-label={`Delete ${translator.name}`}><Trash2 size={14} /></button>
          </article>)}
          {!translators.loading && !translators.data?.items?.length && <p className="empty-inline">No translator profiles yet. Create one to assign it to a movie or series.</p>}
        </div>
      </section>
    </div>}
      </div>
    </div>
  </div>;
}

function SubtitleControls({ item, kind, upload, remove }) {
  return <details className="subtitle-controls">
    <summary>Subtitles Â· {item.subtitles?.length || 0}</summary>
    <form onSubmit={(event) => upload(event, kind, item.id)}>
      <label>Language<input name="language" required maxLength="16" defaultValue="en" /></label>
      <label>Track label<input name="label" required maxLength="80" defaultValue="English" /></label>
      <label>WebVTT file<input name="subtitle" type="file" accept=".vtt,text/vtt" required /></label>
      <button className="button button-muted button-small"><Plus size={13} /> Add track</button>
    </form>
    {item.subtitles?.map((track) => <div className="subtitle-item" key={track.id}>
      <span>{track.label} Â· {track.language}</span>
      <button className="table-action danger" onClick={() => remove(track)} aria-label={`Remove ${track.label} subtitles`}><Trash2 size={13} /></button>
    </div>)}
  </details>;
}

function CategoryChecks({ items, selected = [] }) {
  const ids = selected.map(Number);
  return <fieldset className="category-checks"><legend>Genres</legend>{items.map((item) => <label key={item.id}><input type="checkbox" name="category_ids" value={item.id} defaultChecked={ids.includes(Number(item.id))} />{item.name}</label>)}</fieldset>;
}

export default AdminDashboard;
