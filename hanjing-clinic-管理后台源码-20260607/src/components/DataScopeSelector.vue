<script setup lang="ts">
import { computed } from 'vue'
import { personalScope, scopeLabel, type DataScope } from '@/utils/dataScope'
const props = defineProps<{ modelValue?: DataScope | null; stores: Array<{ id: string | number; name: string }>; allowInherit?: boolean; inheritedScope?: DataScope | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: DataScope | null] }>()
const selected = computed(() => props.modelValue?.type || (props.allowInherit ? 'inherit' : 'self'))
function choose(type: string) {
  emit('update:modelValue', type === 'inherit' ? null : { ...personalScope(), type: type as DataScope['type'] })
}
function allStores(event: Event) {
  emit('update:modelValue', { type: 'store', all_stores: (event.target as HTMLInputElement).checked, store_ids: [] })
}
function toggleStore(id: string | number, event: Event) {
  const ids = new Set(props.modelValue?.store_ids || [])
  if ((event.target as HTMLInputElement).checked) ids.add(Number(id)); else ids.delete(Number(id))
  emit('update:modelValue', { type: 'store', all_stores: false, store_ids: [...ids] })
}
</script>
<template>
  <div class="scope-editor">
    <div class="scope-options" role="group" aria-label="查看数据范围">
      <button v-if="allowInherit" type="button" :class="{ selected: selected === 'inherit' }" :aria-pressed="selected === 'inherit'" @click="choose('inherit')">继承角色</button>
      <button v-for="option in [{ value: 'self', label: '个人数据' }, { value: 'store', label: '门店数据' }, { value: 'system', label: '系统数据' }]" :key="option.value" type="button" :class="{ selected: selected === option.value }" :aria-pressed="selected === option.value" @click="choose(option.value)">{{ option.label }}</button>
    </div>
    <p v-if="selected === 'inherit'" class="scope-note">当前继承：{{ scopeLabel(inheritedScope, stores) }}。角色调整后自动更新。</p>
    <p v-else-if="selected === 'self'" class="scope-note">个人：对应账号可查看个人所有数据</p>
    <p v-else-if="selected === 'system'" class="scope-note">系统：对应账号可查看系统的全部数据</p>
    <div v-else class="scope-stores">
      <p class="scope-note">门店：对应账号可查看门店的全部数据</p>
      <label><input type="checkbox" :checked="modelValue?.all_stores" @change="allStores">全部门店（包含后续新增门店）</label>
      <div class="scope-store-list">
        <label v-for="store in stores" :key="store.id"><input type="checkbox" :checked="modelValue?.all_stores || modelValue?.store_ids.includes(Number(store.id))" :disabled="modelValue?.all_stores" @change="toggleStore(store.id, $event)">{{ store.name }}</label>
      </div>
      <p v-if="!modelValue?.all_stores && !modelValue?.store_ids.length" class="scope-note">请至少选择一家门店。</p>
    </div>
  </div>
</template>
<style scoped>
.scope-editor { display: grid; gap: 12px; }
.scope-options { display: flex; flex-wrap: wrap; gap: 8px; }
.scope-options button { padding: 9px 18px; border: 1px solid var(--td-component-border, #dce1e8); border-radius: 6px; background: #fff; color: #4b5563; cursor: pointer; font: inherit; font-size: 14px; }
.scope-options button.selected { color: var(--td-brand-color, #3b6bf5); border-color: currentColor; background: var(--td-brand-color-light, #eef3ff); }
.scope-note { margin: 0; font-size: 13px; line-height: 1.6; color: #6b7280; }
.scope-stores { display: grid; gap: 12px; padding: 14px; background: #f8fafc; border-radius: 8px; }
.scope-stores label { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.scope-store-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
input { accent-color: var(--td-brand-color, #3b6bf5); }
</style>
