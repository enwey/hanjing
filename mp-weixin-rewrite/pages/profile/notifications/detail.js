const api = require('../../../api/index');
const { formatChinaDateTime } = require('../../../common/utils/date-time');
const { apiBaseUrl } = require('../../../api/request');
function normalize(n) {
 const detail=n.businessDetail ? {...n.businessDetail,actions:(n.businessDetail.actions || []).filter(action=>action.path!==n.target)} : null;
 if(detail && detail.image && detail.image.startsWith('/uploads/')) detail.image=apiBaseUrl+detail.image;
 return {...n,businessDetail:detail,timeText:formatChinaDateTime(n.createdAt,false)};
}
Page({
 data:{loading:true,error:'',notification:null},
 onLoad(options){this._id=options.id;this.load();},
 async load(){this.setData({loading:true,error:''});try{const response=await api.getNotificationDetail(this._id);this.setData({notification:normalize(response.data || response)});}catch(e){this.setData({error:e.message || '加载失败'});}finally{this.setData({loading:false});}},
 async openTarget(event){
  if(this._opening)return;
  this._opening=true;
  try{
   const response=await api.getNotificationDetail(this._id);const n=normalize(response.data||response);
   this.setData({notification:n});
   const actionIndex=event && event.currentTarget && event.currentTarget.dataset.actionIndex;
   const selected=actionIndex!==undefined ? (n.businessDetail && n.businessDetail.actions || [])[Number(actionIndex)] : null;
   const target=actionIndex!==undefined ? selected && selected.path : n.target;
   if(!target)return;
   await new Promise((resolve,reject)=>wx.navigateTo({url:target,success:resolve,fail:reject}));
  }catch(e){wx.showToast({title:e.message||'打开失败',icon:'none'});}finally{this._opening=false;}
 },
 previewImage(){const image=this.data.notification && this.data.notification.businessDetail && this.data.notification.businessDetail.image;if(image)wx.previewImage({current:image,urls:[image]});}
});
