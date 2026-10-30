export function getSaveStatusPresentation(saveState, storageStatus) {
  switch (saveState?.status) {
    case 'dirty':
      return { label: '有未保存修改' };
    case 'saving':
      return { label: '保存中…' };
    case 'saved':
      if (saveState.syncStatus === 'synced') return { label: '已同步' };
      if (saveState.syncStatus === 'local' && storageStatus === 'supabase-error') {
        return { label: '已保存到本机，等待同步' };
      }
      if (saveState.syncStatus === 'local') return { label: '已保存到本机' };
      return { label: '保存状态待确认' };
    case 'error':
      return { label: '保存失败', retryLabel: '重新保存' };
    default:
      return null;
  }
}
