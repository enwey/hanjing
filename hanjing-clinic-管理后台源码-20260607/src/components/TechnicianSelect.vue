<script setup lang="ts">
import { onMounted, ref } from 'vue'
import request from '@/utils/request'

const model = defineModel<string>({ default: '' })
const options = ref<any[]>([])
onMounted(async () => {
  try {
    const res: any = await request.get('/api/admin/fulfillment/technicians')
    if (res.code === 200) options.value = res.data || []
  } catch (error) { console.error('获取技师列表失败', error) }
})
const label = (item: any) => item.real_name || item.name || item.username
</script>

<template>
  <div class="technician-field">
    <label class="form-label">履约技师（选填）</label>
    <t-select v-model="model" placeholder="不分配，不创建履约单" clearable>
      <t-option v-for="item in options" :key="item.id" :value="String(item.id)" :label="label(item)" />
    </t-select>
  </div>
</template>

<style scoped>
.technician-field { margin-top: 12px; }
.form-label { display: block; margin-bottom: 6px; font-size: 13px; color: #374151; }
</style>
