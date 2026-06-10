import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'

export function useTableScrollable(tableRef: any) {
  const isScrollable = ref(false)
  let observer: ResizeObserver | null = null

  const check = () => {
    const el = tableRef.value?.$el
    if (!el) return
    // TDesign Table's scrollable container has class .t-table__content
    const container = el.querySelector('.t-table__content') || el
    isScrollable.value = container.scrollWidth > container.clientWidth
  }

  onMounted(() => {
    nextTick(() => {
      check()
      const el = tableRef.value?.$el
      if (!el) return
      
      const container = el.querySelector('.t-table__content')
      const table = el.querySelector('.t-table__table') || el.querySelector('table')
      
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => {
          check()
        })
        if (container) observer.observe(container)
        if (table) observer.observe(table)
      } else {
        window.addEventListener('resize', check)
      }
    })
  })

  onBeforeUnmount(() => {
    if (observer) {
      observer.disconnect()
    } else {
      window.removeEventListener('resize', check)
    }
  })

  return { isScrollable, check }
}
