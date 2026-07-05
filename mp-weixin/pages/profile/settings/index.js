"use strict";

Page({
  data: {
    sections: [
      {
        key: "account",
        title: "账号与资料",
        items: [
          {
            key: "personal",
            icon: "/static/icons/profile-settings.svg",
            label: "个人信息",
            desc: "查看并修改头像、昵称、身份证号等资料",
            url: "/pages/profile/settings/personal-info/index",
          },
          {
            key: "security",
            icon: "/static/icons/lock-settings.svg",
            label: "账号安全",
            desc: "修改手机号、密码与登录安全信息",
            url: "/pages/profile/settings/account-security/index",
          },
        ],
      },
      {
        key: "service",
        title: "服务与通知",
        items: [
          {
            key: "members",
            icon: "/static/icons/tab-profile-active.png",
            label: "家庭成员",
            desc: "管理关联就诊人及家庭成员资料",
            url: "/pages/profile/family-members/index",
          },
          {
            key: "notifications",
            icon: "/static/icons/bell.svg",
            label: "消息通知",
            desc: "查看订单、预约、社区互动与系统通知",
            url: "/pages/profile/notifications/index",
          },
          {
            key: "service",
            icon: "/static/icons/chat.svg",
            label: "在线客服",
            desc: "联系门诊客服并查看沟通记录",
            url: "/pages/profile/online-service/index",
          },
          {
            key: "member-benefits",
            icon: "/static/icons/tab-mall-active.png",
            label: "会员权益",
            desc: "查看会员等级、权益说明与积分兑换",
            url: "/pages/profile/member-benefits/index",
          },
        ],
      },
    ],
  },

  goItem(event) {
    const { url } = event.currentTarget.dataset;
    if (!url) return;
    wx.navigateTo({ url });
  },

  logout() {
    wx.showModal({
      title: "退出登录",
      content: "确定要退出当前账号吗？",
      success: (res) => {
        if (!res.confirm) return;
        wx.removeStorageSync("access_token");
        wx.removeStorageSync("selected_treatment_patient_id");
        wx.removeStorageSync("selected_medical_record_patient_id");
        wx.showToast({ title: "已退出登录", icon: "success" });
        setTimeout(() => {
          wx.reLaunch({ url: "/pages/profile/index" });
        }, 300);
      },
    });
  },
});
