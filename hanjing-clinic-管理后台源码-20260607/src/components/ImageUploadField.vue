<script setup lang="ts">
import { computed, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

const props = withDefaults(defineProps<{
  modelValue: string
  label?: string
  context?: string
  accept?: string[]
  maxSizeMb?: number
  ratio?: number
  ratioLabel?: string
  minWidth?: number
  minHeight?: number
  previewRatio?: string
}>(), {
  label: '图片',
  context: 'common',
  accept: () => ['image/jpeg', 'image/png', 'image/webp'],
  maxSizeMb: 2,
  ratio: 0,
  ratioLabel: '',
  minWidth: 0,
  minHeight: 0,
  previewRatio: '16 / 9'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

const formatText = computed(() => props.accept
  .map(type => type.replace('image/', '').replace('jpeg', 'jpg').toUpperCase())
  .join(' / ')
)

const requirementText = computed(() => {
  const parts = [`格式：${formatText.value}`, `大小：不超过 ${props.maxSizeMb}MB`]
  if (props.ratioLabel) parts.push(`比例：${props.ratioLabel}`)
  if (props.minWidth && props.minHeight) parts.push(`建议尺寸：不低于 ${props.minWidth}x${props.minHeight}px`)
  return parts.join('；')
})

const requirementItems = computed(() => {
  const items = [
    { label: '格式', value: formatText.value },
    { label: '大小', value: `≤ ${props.maxSizeMb}MB` }
  ]
  if (props.ratioLabel) items.push({ label: '比例', value: props.ratioLabel })
  if (props.minWidth && props.minHeight) items.push({ label: '尺寸', value: `≥ ${props.minWidth}x${props.minHeight}px` })
  return items
})

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function getImageSize(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = reject
    image.src = dataUrl
  })
}

async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  try {
    if (!props.accept.includes(file.type)) {
      MessagePlugin.warning(`请上传 ${formatText.value} 格式图片`)
      return
    }
    if (file.size > props.maxSizeMb * 1024 * 1024) {
      MessagePlugin.warning(`图片大小不能超过 ${props.maxSizeMb}MB`)
      return
    }

    const dataUrl = await readFileAsDataUrl(file)
    const size = await getImageSize(dataUrl)
    if (props.minWidth && size.width < props.minWidth) {
      MessagePlugin.warning(`图片宽度不能小于 ${props.minWidth}px`)
      return
    }
    if (props.minHeight && size.height < props.minHeight) {
      MessagePlugin.warning(`图片高度不能小于 ${props.minHeight}px`)
      return
    }
    if (props.ratio) {
      const currentRatio = size.width / size.height
      const diff = Math.abs(currentRatio - props.ratio) / props.ratio
      if (diff > 0.06) {
        MessagePlugin.warning(`图片比例需接近 ${props.ratioLabel}`)
        return
      }
    }

    uploading.value = true
    const res: any = await request.post('/api/admin/uploads/images', {
      fileName: file.name,
      mimeType: file.type,
      fileData: dataUrl,
      context: props.context
    })
    emit('update:modelValue', res.data?.url || '')
    MessagePlugin.success('图片上传成功')
  } catch (error) {
    MessagePlugin.error('图片上传失败')
  } finally {
    uploading.value = false
    target.value = ''
  }
}
</script>

<template>
  <div class="image-upload-field">
    <button
      type="button"
      class="image-preview"
      :class="{ 'has-image': modelValue, uploading }"
      :style="{ aspectRatio: previewRatio }"
      :disabled="uploading"
      @click="inputRef?.click()"
    >
      <img v-if="modelValue" :src="modelValue" :alt="label">
      <div v-else class="image-empty">
        <span class="empty-icon"><AppIcon name="image-plus" size="28" /></span>
        <span class="empty-title">上传{{ label }}</span>
        <span class="empty-sub">点击选择本地图片</span>
      </div>
      <div v-if="modelValue" class="image-mask">
        <AppIcon name="image-plus" />
        <span>重新上传</span>
      </div>
    </button>
    <div class="image-upload-main">
      <input
        ref="inputRef"
        class="hidden-input"
        type="file"
        :accept="accept.join(',')"
        @change="handleFileChange"
      >
      <button type="button" class="upload-button" :disabled="uploading" @click="inputRef?.click()">
        <AppIcon name="image-plus" />
        {{ uploading ? '上传中...' : `上传${label}` }}
      </button>
      <div class="upload-title">上传前请确认图片规范</div>
      <div class="upload-rules" :title="requirementText">
        <span v-for="item in requirementItems" :key="item.label" class="rule-chip">
          <b>{{ item.label }}</b>{{ item.value }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.image-upload-field {
  display: flex;
  gap: 14px;
  align-items: stretch;
  padding: 12px;
  border: 1px solid #e5eaf3;
  border-radius: 14px;
  background:
    radial-gradient(circle at 0 0, rgba(59, 107, 245, 0.08), transparent 28%),
    linear-gradient(135deg, #ffffff 0%, #f8fbff 100%);
}

.image-preview {
  position: relative;
  width: 152px;
  min-height: 96px;
  padding: 0;
  border-radius: 12px;
  overflow: hidden;
  background:
    linear-gradient(135deg, rgba(59, 107, 245, 0.08), rgba(20, 184, 166, 0.08)),
    #f8fafc;
  border: 1px dashed #a9bdfb;
  flex-shrink: 0;
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.image-preview:hover:not(:disabled) {
  border-color: var(--primary-500);
  box-shadow: 0 12px 26px rgba(59, 107, 245, 0.14);
  transform: translateY(-1px);
}

.image-preview.has-image {
  border-style: solid;
  border-color: #dbe4f5;
  background: #f8fafc;
}

.image-preview img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.image-empty {
  height: 100%;
  min-height: 96px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: #6b7a90;
}

.empty-icon {
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #fff;
  color: var(--primary-500);
  box-shadow: 0 8px 18px rgba(59, 107, 245, 0.12);
}

.empty-title {
  color: #233044;
  font-size: 13px;
  font-weight: 700;
}

.empty-sub {
  color: #8a96a8;
  font-size: 12px;
}

.image-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: rgba(12, 21, 38, 0.56);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  opacity: 0;
  transition: opacity 0.18s ease;
}

.image-preview:hover .image-mask {
  opacity: 1;
}

.image-upload-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 9px;
  flex: 1;
}

.hidden-input {
  display: none;
}

.upload-button {
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 15px;
  border-radius: 999px;
  border: 1px solid rgba(59, 107, 245, 0.22);
  background: linear-gradient(135deg, #ffffff, #eef4ff);
  color: var(--primary-500);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(59, 107, 245, 0.1);
}

.upload-button:hover:not(:disabled) {
  border-color: var(--primary-500);
  background: linear-gradient(135deg, #f8fbff, #e7efff);
}

.upload-button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.upload-title {
  color: #233044;
  font-size: 13px;
  font-weight: 700;
}

.upload-rules {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.rule-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid #e1e8f5;
  color: #5d6b80;
  font-size: 12px;
  line-height: 1;
}

.rule-chip b {
  color: #2f3c52;
  font-weight: 700;
}

@media (max-width: 640px) {
  .image-upload-field {
    flex-direction: column;
  }

  .image-preview {
    width: 100%;
  }
}
</style>
