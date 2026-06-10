"use strict";
((exports.AppointmentStatusMap = {
  pending: { label: "待确认", color: "#F59E0B", bgColor: "#FFFBEB" },
  confirmed: { label: "已确认", color: "#3B6BF5", bgColor: "#EEF4FF" },
  reminded: { label: "已提醒", color: "#8EAFFF", bgColor: "#EEF4FF" },
  checked_in: { label: "已签到", color: "#1A9D5C", bgColor: "#D3F5E3" },
  completed: { label: "已完成", color: "#6B7280", bgColor: "#F3F4F6" },
  cancelled: { label: "已取消", color: "#EF4444", bgColor: "#FEF2F2" },
  no_show: { label: "未到诊", color: "#EF4444", bgColor: "#FEF2F2" },
}),
  (exports.AppointmentTypeMap = {
    first: "初诊",
    followup: "复诊",
    adjust: "调整",
  }));
