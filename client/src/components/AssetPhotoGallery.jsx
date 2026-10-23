import React, { useEffect, useState, useRef } from 'react';
import { Button, Spin, Empty, Modal, message, Tooltip, Tag } from 'antd';
import { Camera, Trash2, ZoomIn, Upload, MapPin } from 'lucide-react';
import api from '../utils/api';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const CONTEXT_COLORS = {
  INWARD:   'blue',
  AUDIT:    'purple',
  ISSUE:    'red',
  DISPOSAL: 'orange',
  GENERAL:  'default',
};

const thumb = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_BASE.replace('/api', '')}${url}`;
};

const AssetPhotoGallery = ({
  assetId,
  context  = 'GENERAL',
  readOnly = false,
  compact  = false,
}) => {
  const [photos,   setPhotos]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview,  setPreview]  = useState(null);
  const fileInputRef = useRef(null);

  const fetchPhotos = async () => {
    if (!assetId) return;
    setLoading(true);
    try {
      const res = await api.get(`/asset-photos/asset/${assetId}`);
      const list = res?.data?.data ?? res?.data ?? [];
      setPhotos(Array.isArray(list) ? list : []);
    } catch {
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPhotos(); }, [assetId]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (file.size > 5 * 1024 * 1024) { message.error('Image must be 5 MB or less'); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('photo', file);
      form.append('context', context);
      if (navigator.geolocation) {
        await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => { form.append('latitude', pos.coords.latitude.toString()); form.append('longitude', pos.coords.longitude.toString()); resolve(); },
            () => resolve(),
            { timeout: 4000 }
          );
        });
      }
      await api.post(`/asset-photos/asset/${assetId}`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      message.success('Photo saved');
      fetchPhotos();
    } catch { message.error('Upload failed — please try again'); }
    finally { setUploading(false); }
  };

  const handleDelete = (photo) => {
    Modal.confirm({
      title: 'Delete this photo?', content: 'This action cannot be undone.',
      okText: 'Yes, Delete', okButtonProps: { danger: true }, cancelText: 'Cancel',
      onOk: async () => {
        try {
          await api.delete(`/asset-photos/${photo.id}`);
          message.success('Photo deleted');
          setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
        } catch { message.error('Could not delete photo'); }
      }
    });
  };

  const gridSize = compact ? 72 : 96;
  const iconSize = compact ? 14 : 16;

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: compact ? 8 : 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Camera size={iconSize} color="var(--color-navy)" />
          <span style={{ fontSize: compact ? 12 : 13, fontWeight: 600, color: 'var(--color-text-body)' }}>Photo Evidence</span>
          {photos.length > 0 && <Tag color={CONTEXT_COLORS[context] || 'default'} style={{ fontSize: 11 }}>{photos.length} photo{photos.length !== 1 ? 's' : ''}</Tag>}
        </div>
        {!readOnly && (
          <>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileChange} />
            <Button size="small" icon={<Upload size={12} style={{ verticalAlign: 'middle' }} />} loading={uploading} onClick={() => fileInputRef.current?.click()} style={{ fontSize: 12 }}>
              {uploading ? 'Uploading\u2026' : 'Add Photo'}
            </Button>
          </>
        )}
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: compact ? 16 : 24 }}><Spin size="small" /></div>
      ) : photos.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{readOnly ? 'No photos on record' : 'No photos yet \u2014 tap \u201cAdd Photo\u201d to capture one'}</span>} style={{ margin: compact ? '8px 0' : '16px 0' }} />
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {photos.map((photo) => (
            <div key={photo.id} style={{ position: 'relative', width: gridSize, height: gridSize, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--color-border)', background: 'var(--color-bg-page)', flexShrink: 0 }}>
              <img src={thumb(photo.photo_url)} alt={photo.caption || 'Asset photo'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.style.display = 'none'; }} />
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0, transition: 'opacity 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; }} onMouseLeave={(e) => { e.currentTarget.style.opacity = 0; }}>
                <Tooltip title="View"><button onClick={() => setPreview(photo)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#fff' }}><ZoomIn size={16} /></button></Tooltip>
                {!readOnly && <Tooltip title="Delete"><button onClick={() => handleDelete(photo)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#ff7875' }}><Trash2 size={16} /></button></Tooltip>}
              </div>
              {photo.latitude && <div style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.55)', borderRadius: 4, padding: '2px 4px' }}><MapPin size={10} color="#fff" /></div>}
            </div>
          ))}
        </div>
      )}
      <Modal open={!!preview} onCancel={() => setPreview(null)} footer={null} width={640} centered title={preview?.caption || 'Photo'} styles={{ body: { padding: 0, textAlign: 'center' } }} destroyOnClose>
        {preview && (
          <>
            <img src={thumb(preview.photo_url)} alt={preview.caption || 'Asset photo'} style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} />
            <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border-light)' }}>
              <span>Context: <Tag color={CONTEXT_COLORS[preview.context] || 'default'} style={{ fontSize: 11 }}>{preview.context}</Tag></span>
              {preview.latitude && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={11} />{parseFloat(preview.latitude).toFixed(5)}, {parseFloat(preview.longitude).toFixed(5)}</span>}
              <span>{preview.created_at ? new Date(preview.created_at).toLocaleString('en-IN') : ''}</span>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
};

export default AssetPhotoGallery;
