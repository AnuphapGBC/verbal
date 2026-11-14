import React, { useEffect, useId, useRef, useState } from 'react';
import { Camera, Check, Trash2 } from 'lucide-react';
import { api, defaultAvatar, imageFallback } from './api';
import './profile-photo.css';

const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
const maxFileBytes = 5 * 1024 * 1024;
const maxPhotoBytes = 200 * 1024;

async function openPhoto(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file); } catch { /* Older browsers may need an Image element. */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This photo could not be opened. Choose another JPEG, PNG, or WebP image.')); };
    image.src = url;
  });
}

export async function prepareProfilePhoto(file) {
  if (!file || !allowedTypes.includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP image.');
  if (file.size > maxFileBytes) throw new Error('Choose a photo that is 5 MB or smaller.');
  const image = await openPhoto(file);
  try {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error('This photo could not be opened. Choose another image.');
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare this photo. Please try another browser.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 256, 256);
    const side = Math.min(width, height);
    context.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, 256, 256);
    const prepared = canvas.toDataURL('image/jpeg', 0.82);
    if (!prepared.startsWith('data:image/jpeg;base64,') || (prepared.split(',')[1]?.length || 0) * 3 / 4 > maxPhotoBytes) {
      throw new Error('This photo could not be prepared. Choose a smaller image.');
    }
    return prepared;
  } finally { image.close?.(); }
}

export default function ProfilePhoto({ user, onUpdated, notify }) {
  const id = useId();
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const selection = useRef(0);
  const request = useRef(null);
  const fileInput = useRef(null);
  useEffect(() => {
    setPreview(''); setBusy(''); setError(''); setStatus('');
    return () => { selection.current += 1; request.current?.abort(); };
  }, [user.id]);

  async function choosePhoto(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const currentSelection = ++selection.current;
    setBusy('Preparing photo...'); setError(''); setStatus(''); setPreview('');
    try {
      const prepared = await prepareProfilePhoto(file);
      if (selection.current === currentSelection) { setPreview(prepared); setStatus('Preview ready. Save your photo to use it.'); }
    } catch (err) { if (selection.current === currentSelection) setError(err.message); }
    finally { if (selection.current === currentSelection) setBusy(''); }
  }

  async function savePhoto(remove = false) {
    const currentSelection = selection.current;
    const controller = new AbortController();
    request.current = controller;
    setBusy(remove ? 'Removing photo...' : 'Saving photo...'); setError(''); setStatus('');
    try {
      const { image } = await api('/account/photo', { method: remove ? 'DELETE' : 'PUT', ...(remove ? {} : { body: { image: preview } }), signal: controller.signal });
      if (controller.signal.aborted || selection.current !== currentSelection) return;
      onUpdated({ ...user, image }); setPreview('');
      const message = remove ? 'Your profile photo has been removed.' : 'Your profile photo has been saved.';
      setStatus(message); notify?.(message);
    } catch (err) { if (err.name !== 'AbortError' && selection.current === currentSelection) setError(err.message); }
    finally { if (selection.current === currentSelection) setBusy(''); }
  }

  return <section className="panel profile-photo-panel" aria-labelledby={`${id}-title`} aria-busy={Boolean(busy)}>
    <h2 id={`${id}-title`}>Profile photo</h2>
    <div className="profile-photo-editor">
      <img className="profile-photo-preview" src={preview || user.image || defaultAvatar} onError={imageFallback} alt={preview ? 'New profile photo preview' : `${user.name}'s profile photo`} width="96" height="96" />
      <div className="profile-photo-controls">
        <p className="muted" id={`${id}-hint`}>Your photo appears on your account and tutor profile. Choose a JPEG, PNG, or WebP up to 5 MB. We crop it to a square.</p>
        <input ref={fileInput} type="file" accept={allowedTypes.join(',')} onChange={choosePhoto} disabled={Boolean(busy)} hidden aria-label="Choose a profile photo" aria-describedby={`${id}-hint`} />
        <div className="profile-photo-actions">
          <button className="outlined-btn" type="button" disabled={Boolean(busy)} onClick={() => fileInput.current?.click()}><Camera size={17} aria-hidden="true" /> {user.image || preview ? 'Choose another photo' : 'Choose photo'}</button>
          {preview && <><button className="dark-btn" type="button" disabled={Boolean(busy)} onClick={() => savePhoto()}><Check size={17} aria-hidden="true" /> Save photo</button><button className="mini-btn" type="button" disabled={Boolean(busy)} onClick={() => { setPreview(''); setError(''); setStatus(''); }}>Cancel</button></>}
          {user.image && !preview && <button className="mini-btn" type="button" disabled={Boolean(busy)} onClick={() => savePhoto(true)}><Trash2 size={16} aria-hidden="true" /> Remove photo</button>}
        </div>
        <p className="profile-photo-status muted" role="status">{busy || status}</p>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </div>
  </section>;
}
