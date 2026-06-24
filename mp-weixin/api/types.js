"use strict";
((exports.AppointmentStatusMap = {
  pending: { label: "已预约", color: "#1A9D5C", bgColor: "#D3F5E3" },
  confirmed: { label: "候诊中", color: "#F59E0B", bgColor: "#FFFBEB" },
  reminded: { label: "候诊中", color: "#F59E0B", bgColor: "#FFFBEB" },
  checked_in: { label: "就诊中", color: "#1A9D5C", bgColor: "#D3F5E3" },
  completed: { label: "待结算", color: "#EF4444", bgColor: "#FEF2F2" },
  arrived: { label: "已完成", color: "#6B7280", bgColor: "#F3F4F6" },
  cancelled: { label: "已取消", color: "#9CA3AF", bgColor: "#F9FAFB" },
  no_show: { label: "未到诊", color: "#9CA3AF", bgColor: "#F9FAFB" },
}),
  (exports.AppointmentTypeMap = {
    first: "初诊",
    followup: "复诊",
    adjust: "调整",
  }));
