import { useEffect, useState } from 'react';
import {
  getCachedPhotoObjectUrl,
  getPhotoObjectUrl,
  getRuntimeAssetUrl,
  releaseRuntimeAssetReference,
  retainRuntimeAsset,
} from './travelDb';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { getPhotoUrl } from '../services/supabaseTravelRepository';

function isEphemeralUrl(value) {
  return typeof value === 'string' && (value.startsWith('blob:') || value.startsWith('data:'));
}

export function getPhotoFallbackUrl(photo) {
  if (typeof photo === 'string') return photo;
  return photo?.url || photo?.src || photo?.dataUrl || photo?.sourceUrl || '';
}

export function getPhotoId(photo) {
  if (typeof photo === 'string') return '';
  return photo?.assetId || photo?.id || '';
}

export function getPhotoKey(photo) {
  return getPhotoId(photo) || getPhotoFallbackUrl(photo);
}

export function usePhotoObjectUrl(photo) {
  const fallbackUrl = getPhotoFallbackUrl(photo);
  const assetId = getPhotoId(photo);
  const storagePath = photo?.storagePath || photo?.storage_path || '';
  const [resolvedUrl, setResolvedUrl] = useState(() => (
    photo?.blob
      ? getRuntimeAssetUrl(assetId, photo.blob)
      : getCachedPhotoObjectUrl(assetId) || (assetId && isEphemeralUrl(fallbackUrl) ? '' : fallbackUrl)
  ));

  useEffect(() => {
    let active = true;
    let retainedAsset = false;
    const retainUrl = (url) => {
      if (assetId && url?.startsWith('blob:')) retainedAsset = retainRuntimeAsset(assetId);
    };
    const releaseUrl = () => {
      if (retainedAsset) releaseRuntimeAssetReference(assetId);
    };
    const usesSupabaseStorage = isSupabaseConfigured && storagePath;
    const immediateUrl = photo?.blob
      ? getRuntimeAssetUrl(assetId, photo.blob)
      : getCachedPhotoObjectUrl(assetId) || (usesSupabaseStorage ? '' : (assetId && isEphemeralUrl(fallbackUrl) ? '' : fallbackUrl));
    setResolvedUrl(immediateUrl || '');
    if (immediateUrl) {
      retainUrl(immediateUrl);
      return () => { active = false; releaseUrl(); };
    }
    if (!assetId && !storagePath) return () => { active = false; };

    const loadUrl = isSupabaseConfigured && storagePath
      ? getPhotoUrl(storagePath)
      : getPhotoObjectUrl(assetId);
    loadUrl.then((url) => {
      if (active && url) {
        retainUrl(url);
        setResolvedUrl(url);
      }
    }).catch(() => {
      if (active) setResolvedUrl('');
    });
    return () => { active = false; releaseUrl(); };
  }, [assetId, fallbackUrl, photo?.blob, storagePath]);

  return resolvedUrl || '';
}

export default usePhotoObjectUrl;
