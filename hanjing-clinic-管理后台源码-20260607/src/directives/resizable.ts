import { Directive } from 'vue'

export const resizable: Directive = {
  mounted(el: HTMLTableElement) {
    if (el.tagName !== 'TABLE') return

    const parent = el.parentElement
    if (parent) {
      parent.style.overflowX = 'auto'
      parent.style.width = '100%'
    }

    // Default to auto layout initially to let browser calculate content-based widths + padding
    el.style.tableLayout = 'auto'

    const headers = Array.from(el.querySelectorAll('thead th')) as HTMLElement[]
    if (headers.length <= 1) return

    const checkScrollable = () => {
      if (!parent) return
      const parentWidth = parent.clientWidth
      const lastTh = headers[headers.length - 1]
      
      // Calculate total columns width by summing the parsed width of all header elements.
      let totalWidth = 0
      headers.forEach((th) => {
        const styleW = th.style.width
        let w = 0
        if (styleW && styleW.includes('%')) {
          const pct = parseFloat(styleW) / 100
          w = Math.max(parseFloat(th.style.minWidth) || 0, pct * parentWidth)
        } else {
          w = parseFloat(styleW) || th.getBoundingClientRect().width
        }
        totalWidth += w
      })
      
      // If table-layout is fixed, all columns are explicitly sized in pixels.
      // We must keep the exact computed totalWidth to prevent other columns from shifting.
      if (el.style.tableLayout === 'fixed') {
        const finalWidth = Math.max(parentWidth, totalWidth)
        el.style.width = `${finalWidth}px`
        el.style.minWidth = `${finalWidth}px`
        if (totalWidth > parentWidth) {
          el.classList.add('is-scrollable')
        } else {
          el.classList.remove('is-scrollable')
        }
        return
      }
      
      if (totalWidth > parentWidth) {
        el.classList.add('is-scrollable')
        el.style.width = `${totalWidth}px`
        el.style.minWidth = `${totalWidth}px`
        if (lastTh) {
          lastTh.style.width = lastTh.style.minWidth
        }
      } else {
        el.classList.remove('is-scrollable')
        el.style.width = '100%'
        el.style.minWidth = '100%'
        if (lastTh) {
          lastTh.style.width = lastTh.style.minWidth || ''
        }
      }
    }

    // Run check after mount layout settles
    setTimeout(checkScrollable, 150)

    const resizeHandler = () => {
      checkScrollable()
    }
    window.addEventListener('resize', resizeHandler)
    ;(el as any)._resizeHandler = resizeHandler

    const resizableHeaders = headers.slice(0, -1)

    resizableHeaders.forEach((th) => {
      th.style.position = 'relative'

      const handle = document.createElement('div')
      handle.className = 'resize-handle'
      
      handle.style.position = 'absolute'
      handle.style.right = '0'
      handle.style.top = '0'
      handle.style.bottom = '0'
      handle.style.width = '6px'
      handle.style.cursor = 'col-resize'
      handle.style.zIndex = '10'
      handle.style.userSelect = 'none'

      th.appendChild(handle)

      handle.addEventListener('mousedown', (e: MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()

        const startX = e.clientX

        // 1. Freeze ALL column widths in pixels (including the last one)
        headers.forEach((headerTh) => {
          const currentWidth = headerTh.getBoundingClientRect().width
          headerTh.style.width = `${currentWidth}px`
          headerTh.style.minWidth = `${currentWidth}px`
        })

        // 2. Switch to fixed layout for drag support
        el.style.tableLayout = 'fixed'

        const startWidth = th.getBoundingClientRect().width

        const onMouseMove = (moveEvent: MouseEvent) => {
          const deltaX = moveEvent.clientX - startX
          const newWidth = Math.max(50, startWidth + deltaX)
          
          th.style.width = `${newWidth}px`
          th.style.minWidth = `${newWidth}px`

          // Update total table width to match the sum of all columns
          let totalWidth = 0
          headers.forEach((headerTh) => {
            totalWidth += parseFloat(headerTh.style.width) || headerTh.getBoundingClientRect().width
          })
          el.style.width = `${totalWidth}px`
          el.style.minWidth = `${totalWidth}px`

          checkScrollable()
        }

        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove)
          document.removeEventListener('mouseup', onMouseUp)
          // Keep table-layout: fixed to lock the exact resized pixel widths
          checkScrollable()
        }

        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
      })
    })
  },
  unmounted(el: HTMLTableElement) {
    const handler = (el as any)._resizeHandler
    if (handler) {
      window.removeEventListener('resize', handler)
    }
  }
}
