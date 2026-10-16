<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

const router = useRouter()
const settingsLoaded = ref(false)
const saving = ref(false)
const secretConfigured = ref<Record<string, boolean>>({})

// 1. 预约设置
const bookingAdvanceDays = ref<number | null>(null)
const bookingHours = ref('')
const bookingInterval = ref<number | null>(null)
const bookingCancelLimit = ref('')
const allowSelfBooking = ref(false)
const requireDeposit = ref(false)
const depositAmount = ref<number | null>(null)

const cancelLimitOptions = [
  { label: '就诊前2小时', value: '就诊前2小时' },
  { label: '就诊前4小时', value: '就诊前4小时' },
  { label: '就诊前1天', value: '就诊前1天' }
]

// 2. 分销设置
const commission1 = ref<number | null>(null)
const commission2 = ref<number | null>(null)
const distributionSettleDays = ref<number | null>(null)
const minWithdraw = ref<number | null>(null)
const withdrawFeeRate = ref<number | null>(null)
const enableDistribution = ref(false)
const autoApproveWithdraw = ref(false)

// 3. 通知设置
const notifyNewBooking = ref(false)
const notifyWithdrawApply = ref(false)
const notifyVisitReminder = ref(false)
const notifyRevisitReminder = ref(false)
const appointmentSubscribeTemplateIds = ref('')
const wechatTemplateAppointmentCreated = ref('')
const wechatTemplateAppointmentPaid = ref('')
const wechatTemplateAppointmentChanged = ref('')
const wechatTemplateAppointmentStatus = ref('')
const wechatTemplateVisitReminder = ref('')
const wechatTemplateRevisitReminder = ref('')
const wechatTemplateOrderStatus = ref('')
const wechatTemplateWithdrawResult = ref('')
const wechatTemplateWithdrawPaid = ref('')
const wechatTemplateCommissionSettled = ref('')
const wechatTemplateRefundResult = ref('')
const wechatPayAppId = ref('')
const wechatPayMchId = ref('')
const wechatPaySerialNo = ref('')
const wechatPayPrivateKey = ref('')
const wechatPayApiV3Key = ref('')
const wechatPayApiV2Key = ref('')
const wechatPayNotifyUrl = ref('')
const wechatPayAppointmentNotifyUrl = ref('')
const wechatPayRefundNotifyUrl = ref('')
const wechatPayPlatformCert = ref('')

// 4. 权限管理 (角色表格数据)
const roles = ref<any[]>([])

async function loadSettings() {
  settingsLoaded.value = false
  roles.value = []
  try {
    const res: any = await request.get('/api/admin/settings')
    if (res && res.code === 200 && res.data) {
      const data = res.data
      secretConfigured.value = res.configured || {}
      bookingAdvanceDays.value = data.booking_advance_days ?? null
      bookingHours.value = data.booking_hours ?? ''
      bookingInterval.value = data.booking_interval ?? null
      bookingCancelLimit.value = data.booking_cancel_limit ?? ''
      allowSelfBooking.value = data.allow_self_booking ?? false
      requireDeposit.value = data.require_deposit ?? false
      depositAmount.value = data.deposit_amount == null ? null : (data.deposit_amount / 100)

      commission1.value = data.commission1 ?? null
      commission2.value = data.commission2 ?? null
      distributionSettleDays.value = data.distribution_settle_days ?? null
      minWithdraw.value = data.min_withdraw ?? null
      withdrawFeeRate.value = data.withdraw_fee_rate ?? null
      enableDistribution.value = data.enable_distribution ?? false
      autoApproveWithdraw.value = false

      notifyNewBooking.value = data.notify_new_booking ?? false
      notifyWithdrawApply.value = data.notify_withdraw_apply ?? false
      notifyVisitReminder.value = data.notify_visit_reminder ?? false
      notifyRevisitReminder.value = data.notify_revisit_reminder ?? false
      appointmentSubscribeTemplateIds.value = data.appointment_subscribe_template_ids ?? ''
      wechatTemplateAppointmentCreated.value = data.wechat_template_appointment_created ?? ''
      wechatTemplateAppointmentPaid.value = data.wechat_template_appointment_paid ?? ''
      wechatTemplateAppointmentChanged.value = data.wechat_template_appointment_changed ?? ''
      wechatTemplateAppointmentStatus.value = data.wechat_template_appointment_status ?? ''
      wechatTemplateVisitReminder.value = data.wechat_template_visit_reminder ?? ''
      wechatTemplateRevisitReminder.value = data.wechat_template_revisit_reminder ?? ''
      wechatTemplateOrderStatus.value = data.wechat_template_order_status ?? ''
      wechatTemplateWithdrawResult.value = data.wechat_template_withdraw_result ?? ''
      wechatTemplateWithdrawPaid.value = data.wechat_template_withdraw_paid ?? ''
      wechatTemplateCommissionSettled.value = data.wechat_template_commission_settled ?? ''
      wechatTemplateRefundResult.value = data.wechat_template_refund_result ?? ''
      wechatPayAppId.value = data.wechat_pay_app_id ?? ''
      wechatPayMchId.value = data.wechat_pay_mch_id ?? ''
      wechatPaySerialNo.value = data.wechat_pay_serial_no ?? ''
      wechatPayPrivateKey.value = data.wechat_pay_private_key ?? ''
      wechatPayApiV3Key.value = data.wechat_pay_api_v3_key ?? ''
      wechatPayApiV2Key.value = data.wechat_pay_api_v2_key ?? ''
      wechatPayNotifyUrl.value = data.wechat_pay_notify_url ?? ''
      wechatPayAppointmentNotifyUrl.value = data.wechat_pay_appointment_notify_url ?? ''
      wechatPayRefundNotifyUrl.value = data.wechat_pay_refund_notify_url ?? ''
      wechatPayPlatformCert.value = data.wechat_pay_platform_cert ?? ''
      const roleRes: any = await request.get('/api/admin/roles')
      roles.value = (roleRes.data || []).map((role: any) => ({ ...role, membersCount: Number(role.members_count), scope: (role.permissions || []).join('、') || '未配置' }))
      settingsLoaded.value = true
    }
  } catch (err) {
    console.error('加载系统设置失败', err)
    MessagePlugin.error('加载系统设置失败')
  }
}
onMounted(loadSettings)

async function handleSaveAll() {
  if (!settingsLoaded.value || saving.value) return
  if (enableDistribution.value && [commission1.value, commission2.value, distributionSettleDays.value, minWithdraw.value, withdrawFeeRate.value].some(value => value === null)) {
    MessagePlugin.warning('请先完整填写分销财务配置')
    return
  }
  saving.value = true
  try {
    const payload = {
      booking_advance_days: bookingAdvanceDays.value,
      booking_hours: bookingHours.value,
      booking_interval: bookingInterval.value,
      booking_cancel_limit: bookingCancelLimit.value,
      allow_self_booking: allowSelfBooking.value,
      require_deposit: requireDeposit.value,
      deposit_amount: depositAmount.value == null ? null : Math.round(depositAmount.value * 100),

      commission1: commission1.value,
      commission2: commission2.value,
      distribution_settle_days: distributionSettleDays.value,
      min_withdraw: minWithdraw.value,
      withdraw_fee_rate: withdrawFeeRate.value,
      enable_distribution: enableDistribution.value,
      auto_approve_withdraw: autoApproveWithdraw.value,

      notify_new_booking: notifyNewBooking.value,
      notify_withdraw_apply: notifyWithdrawApply.value,
      notify_visit_reminder: notifyVisitReminder.value,
      notify_revisit_reminder: notifyRevisitReminder.value,
      appointment_subscribe_template_ids: appointmentSubscribeTemplateIds.value,
      wechat_template_appointment_created: wechatTemplateAppointmentCreated.value,
      wechat_template_appointment_paid: wechatTemplateAppointmentPaid.value,
      wechat_template_appointment_changed: wechatTemplateAppointmentChanged.value,
      wechat_template_appointment_status: wechatTemplateAppointmentStatus.value,
      wechat_template_visit_reminder: wechatTemplateVisitReminder.value,
      wechat_template_revisit_reminder: wechatTemplateRevisitReminder.value,
      wechat_template_order_status: wechatTemplateOrderStatus.value,
      wechat_template_withdraw_result: wechatTemplateWithdrawResult.value,
      wechat_template_withdraw_paid: wechatTemplateWithdrawPaid.value,
      wechat_template_commission_settled: wechatTemplateCommissionSettled.value,
      wechat_template_refund_result: wechatTemplateRefundResult.value,
      wechat_pay_app_id: wechatPayAppId.value,
      wechat_pay_mch_id: wechatPayMchId.value,
      wechat_pay_serial_no: wechatPaySerialNo.value,
      wechat_pay_private_key: wechatPayPrivateKey.value,
      wechat_pay_api_v3_key: wechatPayApiV3Key.value,
      wechat_pay_api_v2_key: wechatPayApiV2Key.value,
      wechat_pay_notify_url: wechatPayNotifyUrl.value,
      wechat_pay_appointment_notify_url: wechatPayAppointmentNotifyUrl.value,
      wechat_pay_refund_notify_url: wechatPayRefundNotifyUrl.value,
      wechat_pay_platform_cert: wechatPayPlatformCert.value
    }
    const res: any = await request.post('/api/admin/settings', Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== null)))
    if (res && res.code === 200) {
      MessagePlugin.success('系统设置已成功保存')
      await loadSettings()
    }
  } catch (err) {
    console.error('保存系统设置失败', err)
    MessagePlugin.error('保存系统设置失败')
  } finally {
    saving.value = false
  }
}

function handleReset() {
  loadSettings()
}


function editRole(roleId: number) {
  router.push('/permission/role-edit/' + roleId)
}
</script>

<template>
  <div class="page-container">
    <!-- Header -->
    <div class="page-title-row">
      <div>
        <div class="page-title">系统设置</div>
        <div class="page-title-sub">配置系统参数与业务规则</div>
      </div>
      <div style="display: flex; gap: 10px; align-items: center;">


        <button class="btn btn-outline" @click="handleReset" :disabled="saving" style="padding: 0 24px; height: 36px;">重新加载</button>
        <button class="btn btn-primary" @click="handleSaveAll" :disabled="!settingsLoaded || saving" style="padding: 0 32px; height: 36px;">保存设置</button>
      </div>
    </div>

    <!-- 2x2 Grid Panels -->
    <div class="card-grid-2">
      <!-- Panel 1: 预约设置 -->
      <div class="panel" style="margin: 0;">
        <div class="panel-header">
          <div class="panel-title"><AppIcon name="calendar" />  预约设置</div>
        </div>
        <div class="panel-body">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">预约提前天数<span class="required">*</span></label>
              <input type="number" class="form-control" v-model.number="bookingAdvanceDays" min="1" max="30">
            </div>
            <div class="form-group">
              <label class="form-label">每日可约时段</label>
              <input type="text" class="form-control" v-model="bookingHours" placeholder="例如：08:30 - 18:00">
            </div>
            <div class="form-group">
              <label class="form-label">时段间隔（分钟）</label>
              <input type="number" class="form-control" v-model.number="bookingInterval" min="5" max="120" step="5">
            </div>
            <div class="form-group">
              <label class="form-label">取消预约截止</label>
              <select class="form-control" v-model="bookingCancelLimit">
                <option v-for="opt in cancelLimitOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>
            <div class="form-group full">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <label class="form-label" style="margin-bottom: 0;">允许患者自助预约</label>
                <label class="switch">
                  <input type="checkbox" v-model="allowSelfBooking">
                  <span class="switch-slider"></span>
                </label>
              </div>
            </div>
            <div class="form-group full">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <label class="form-label" style="margin-bottom: 0;">预约需支付定金</label>
                <label class="switch">
                  <input type="checkbox" v-model="requireDeposit">
                  <span class="switch-slider"></span>
                </label>
              </div>
            </div>
            <div class="form-group" v-if="requireDeposit">
              <label class="form-label">定金金额（元）<span class="required">*</span></label>
              <div class="input-group">
                <span class="input-prefix">¥</span>
                <input type="number" class="form-control-inner" v-model.number="depositAmount" min="0" step="0.01">
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Panel 2: 分销设置 -->
      <div class="panel" style="margin: 0;">
        <div class="panel-header">
          <div class="panel-title"><AppIcon name="money" />  分销设置</div>
        </div>
        <div class="panel-body">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">一级佣金比例</label>
              <div class="input-group">
                <input type="number" class="form-control-inner form-control-inner-suffix" v-model.number="commission1" min="0" max="100">
                <span class="input-suffix">%</span>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">二级佣金比例</label>
              <div class="input-group">
                <input type="number" class="form-control-inner form-control-inner-suffix" v-model.number="commission2" min="0" max="100">
                <span class="input-suffix">%</span>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">最低提现金额</label>
              <div class="input-group">
                <span class="input-prefix">¥</span>
                <input type="number" class="form-control-inner" v-model.number="minWithdraw" min="10">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">提现手续费率</label>
              <div class="input-group">
                <input type="number" class="form-control-inner form-control-inner-suffix" v-model.number="withdrawFeeRate" min="0" max="10" step="0.1">
                <span class="input-suffix">%</span>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">佣金结算天数</label>
              <div class="input-group">
                <input type="number" class="form-control-inner form-control-inner-suffix" v-model.number="distributionSettleDays" min="0" step="1">
                <span class="input-suffix">天</span>
              </div>
            </div>
            <div class="form-group full">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <label class="form-label" style="margin-bottom: 0;">开启分销功能</label>
                <label class="switch">
                  <input type="checkbox" v-model="enableDistribution">
                  <span class="switch-slider"></span>
                </label>
              </div>
            </div>
            <div class="form-group full">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <label class="form-label" style="margin-bottom: 0;">自动审核提现</label>
                <label class="switch">
                  <input type="checkbox" v-model="autoApproveWithdraw" disabled title="尚未接入真实自动打款">
                  <span class="switch-slider"></span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Panel 3: 通知设置 -->
      <div class="panel" style="margin: 0;">
        <div class="panel-header">
          <div class="panel-title"><AppIcon name="bell" />  通知设置</div>
        </div>
        <div class="panel-body">
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <!-- Notify Item 1 -->
            <div class="notify-item">
              <div>
                <div style="font-size: 14px; font-weight: 600; color: #1F2937;">新预约通知</div>
                <div style="font-size: 12px; color: #9CA3AF; margin-top: 2px;">患者预约时通知管理员和医生</div>
              </div>
              <label class="switch">
                <input type="checkbox" v-model="notifyNewBooking">
                <span class="switch-slider"></span>
              </label>
            </div>
            <!-- Notify Item 2 -->
            <div class="notify-item">
              <div>
                <div style="font-size: 14px; font-weight: 600; color: #1F2937;">提现申请通知</div>
                <div style="font-size: 12px; color: #9CA3AF; margin-top: 2px;">推广员申请提现时通知财务</div>
              </div>
              <label class="switch">
                <input type="checkbox" v-model="notifyWithdrawApply">
                <span class="switch-slider"></span>
              </label>
            </div>
            <!-- Notify Item 3 -->
            <div class="notify-item">
              <div>
                <div style="font-size: 14px; font-weight: 600; color: #1F2937;">就诊提醒</div>
                <div style="font-size: 12px; color: #9CA3AF; margin-top: 2px;">就诊前1小时提醒患者</div>
              </div>
              <label class="switch">
                <input type="checkbox" v-model="notifyVisitReminder">
                <span class="switch-slider"></span>
              </label>
            </div>
            <!-- Notify Item 4 -->
            <div class="notify-item">
              <div>
                <div style="font-size: 14px; font-weight: 600; color: #1F2937;">复诊提醒</div>
                <div style="font-size: 12px; color: #9CA3AF; margin-top: 2px;">到期未复诊患者自动提醒</div>
              </div>
              <label class="switch">
                <input type="checkbox" v-model="notifyRevisitReminder">
                <span class="switch-slider"></span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Panel 4: 权限管理 -->
      <div class="panel" style="margin: 0;">
        <div class="panel-header">
          <div class="panel-title"><AppIcon name="lock" /> 权限管理</div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-sm btn-outline" @click="router.push('/settings/admin')"><AppIcon name="team" />  成员账号</button>
            <button class="btn btn-sm btn-primary" @click="router.push('/permission')"><AppIcon name="plus" />  添加角色</button>
          </div>
        </div>
        <div class="panel-body" style="padding: 0;">
          <table class="data-table">
            <thead>
              <tr>
                <th>角色</th>
                <th style="width: 100px;">成员数</th>
                <th>权限范围</th>
                <th style="width: 100px;">状态</th>
                <th style="text-align: right; width: 80px;">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="role in roles" :key="role.name">
                <td style="font-weight: 600; color: #1F2937;">{{ role.name }}</td>
                <td>
                  <span style="font-weight: 600; color: #4B5563;">{{ role.membersCount }}</span>
                </td>
                <td style="font-size: 12px; color: #6B7280;">{{ role.scope }}</td>
                <td>
                  <span class="status-tag green">启用</span>
                </td>
                <td>
                  <div style="display: flex; gap: 4px; justify-content: flex-end;">
                    <button class="btn btn-xs btn-outline" @click="editRole(role.id)">编辑</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>


  </div>
</template>

<style scoped>
.card-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}
@media (max-width: 1024px) {
  .card-grid-2 {
    grid-template-columns: 1fr;
  }
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #F3F4F6;
}
.panel-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}
.panel-body {
  padding: 20px;
}

/* === 表单样式 === */
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px 16px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-group.full {
  grid-column: span 2;
}
.form-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}
.form-control {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #D1D5DB;
  border-radius: 8px;
  font-size: 13px;
  color: #1F2937;
  outline: none;
  background: #fff;
  transition: all 150ms ease;
  height: 36px;
  box-sizing: border-box;
}
.form-control:focus {
  border-color: var(--primary-500);
  box-shadow: 0 0 0 2px rgba(59, 107, 245, 0.1);
}
.form-control:hover {
  border-color: #BCCFFF;
}
select.form-control {
  appearance: auto;
}
.required {
  color: #EF4444;
  margin-left: 2px;
}

/* === 开关 === */
.switch { position: relative; width: 40px; height: 22px; cursor: pointer; display: inline-block; }
.switch input { display: none; }
.switch-slider {
  position: absolute; inset: 0; background: #E5E7EB;
  border-radius: 11px; transition: 200ms;
}
.switch-slider::before {
  content: ''; position: absolute; width: 18px; height: 18px;
  border-radius: 50%; background: #fff; top: 2px; left: 2px;
  transition: 200ms; box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}
.switch input:checked + .switch-slider { background: var(--primary-500); }
.switch input:checked + .switch-slider::before { transform: translateX(18px); }

/* === 通知选项 === */
.notify-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #F9FAFB;
  border: 1px solid #F3F4F6;
  border-radius: 8px;
  transition: all 150ms ease;
}
.notify-item:hover {
  background: #F3F4F6;
  border-color: #E5E7EB;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
}

/* === 输入框组 (前缀/后缀) === */
.template-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.textarea-control {
  min-height: 96px;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
@media (max-width: 768px) {
  .template-grid {
    grid-template-columns: 1fr;
  }
}

.input-group {
  display: flex;
  align-items: center;
  border: 1px solid #D1D5DB;
  border-radius: 8px;
  background: #fff;
  transition: all 150ms ease;
  height: 36px;
  width: 100%;
  box-sizing: border-box;
}
.input-group:focus-within {
  border-color: var(--primary-500);
  box-shadow: 0 0 0 2px rgba(59, 107, 245, 0.1);
}
.input-group:hover {
  border-color: #BCCFFF;
}
.input-prefix {
  padding-left: 12px;
  color: #9CA3AF;
  font-size: 14px;
  user-select: none;
  display: flex;
  align-items: center;
}
.input-suffix {
  padding-right: 12px;
  color: #9CA3AF;
  font-size: 14px;
  user-select: none;
  display: flex;
  align-items: center;
}
.form-control-inner {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  padding: 8px 12px;
  font-size: 13px;
  color: #1F2937;
  height: 100%;
  box-sizing: border-box;
}
.input-group .input-prefix + .form-control-inner {
  padding-left: 4px;
}
.form-control-inner-suffix {
  padding-right: 4px;
}
</style>
