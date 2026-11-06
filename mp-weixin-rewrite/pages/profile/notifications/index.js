const api = require('../../../api/index');
const { formatChinaDateTime } = require('../../../common/utils/date-time');
const categories = [{id:'',name:'全部'},{id:'appointment',name:'预约'},{id:'treatment',name:'诊疗'},{id:'assessment',name:'报告'},{id:'order',name:'订单'},{id:'community',name:'社区'},{id:'promo',name:'推广'},{id:'system',name:'系统'}];
const unwrap = r => r && r.data ? r.data : r || {};
Page({
  data: { categories, category:'', loading:false, loadingMore:false, hasLoaded:false, notifications:[], unreadCount:0, hasMore:false, error:'', marking:false,hasNew:false },
  onShow() { if (!this.data.hasLoaded) this.fetchNotifications(); else this.refreshSummary(); },
  async refreshSummary() {
    const version=this._version;
    try { const data=unwrap(await api.getNotifications({limit:1})); if(version!==this._version)return; this.setData({unreadCount:Number(data.unread || 0),hasNew:this.hasSnapshotChanged(data)}); } catch(e) { /* Keep the readable cached list; pull down can retry. */ }
  },
  hasSnapshotChanged(data) { return data.snapshotVersion != null && this._snapshotVersion != null ? String(data.snapshotVersion)!==String(this._snapshotVersion) : !!data.snapshotId && String(data.snapshotId)!==String(this._snapshot); },
  wasInSnapshot(n) { return Number(n.id)<=Number(this._snapshot) && (this._snapshotVersion == null || n.changeVersion == null || Number(n.changeVersion)<=Number(this._snapshotVersion)); },
  refreshLatest() { this.fetchNotifications(); },
  onUnload() { this._version = (this._version || 0) + 1; },
  onPullDownRefresh() { return this.fetchNotifications().finally(() => wx.stopPullDownRefresh()); },
  onReachBottom() { if (this.data.hasMore) return this.fetchNotifications({append:true}); },
  selectCategory(e) { const category=e.currentTarget.dataset.id; if (category===this.data.category)return; this.setData({category}); this.fetchNotifications(); },
  retry() { this.fetchNotifications({append:this.data.notifications.length>0 && this.data.hasMore}); },
  async fetchNotifications({append=false}={}) {
    if (append && (this.data.loading || this.data.loadingMore)) return;
    const version=this._version=(this._version || 0)+1;
    if (!append) this.setData({notifications:[],hasMore:false});
    this.setData({loading:!append,loadingMore:append,error:''});
    try {
      const data=unwrap(await api.getNotifications({limit:20, ...(this.data.category?{type:this.data.category}:{}), ...(append&&this._cursor?{before:this._cursor}:{})}));
      if (version!==this._version)return;
      const rows=(data.list || []).map(item=>({...item,id:String(item.id),iconText:(categories.find(c=>c.id===item.type)||{name:'系统'}).name,timeText:formatChinaDateTime(item.createdAt,false)}));
      const map=new Map((append?this.data.notifications:[]).concat(rows).map(item=>[item.id,item]));
      this._cursor=data.nextCursor;
      if (!append) { this._snapshot=data.snapshotId || null; this._snapshotVersion=data.snapshotVersion || null; }
      this.setData({notifications:Array.from(map.values()),unreadCount:Number(data.unread || 0),hasMore:!!data.hasMore,hasLoaded:true,hasNew:append && this.hasSnapshotChanged(data)});
    } catch(e) { if(version===this._version)this.setData({error:e.message || '加载失败，请重试'}); }
    finally { if(version===this._version)this.setData({loading:false,loadingMore:false}); }
  },
  async markAllRead() {
    if(this.data.marking || !this._snapshot)return;
    this.setData({marking:true});
    try {
      const data=unwrap(await api.markAllNotificationsRead(this._snapshot,this._snapshotVersion));
      this.setData({notifications:this.data.notifications.map(n=>this.wasInSnapshot(n)?{...n,isRead:true}:n),unreadCount:Number(data.unread || 0),hasNew:Number(data.unread || 0)>0 || this.data.hasNew});
    } catch(e){wx.showToast({title:e.message || '操作失败',icon:'none'});}
    finally{this.setData({marking:false});}
  },
  async openNotification(e) {
    const id=String(e.currentTarget.dataset.id || '');if(!id || this._opening)return;
    this._opening=true;
    try {
      const selected=this.data.notifications.find(n=>n.id===id);
      const response=unwrap(await api.markNotificationRead(id,selected && selected.changeVersion));
      const wasUnread=this.data.notifications.some(n=>n.id===id&&!n.isRead);
      const readAccepted=response.isRead!==false;
      this.setData({notifications:this.data.notifications.map(n=>n.id===id && String(n.changeVersion)===String(selected && selected.changeVersion)?{...n,isRead:readAccepted}:n),unreadCount:response.unread == null ? Math.max(0,this.data.unreadCount-(wasUnread&&readAccepted?1:0)) : Number(response.unread),hasNew:this.data.hasNew || !readAccepted});
      await new Promise((resolve,reject)=>wx.navigateTo({url:'/pages/profile/notifications/detail?id='+encodeURIComponent(id),success:resolve,fail:reject}));
    } catch(e){wx.showToast({title:e.message || '打开失败，请重试',icon:'none'});}
    finally{this._opening=false;}
  }
});
