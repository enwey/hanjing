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
      const tableWidth = el.getBoundingClientRect().width
      const parentWidth = parent.clientWidth
      
      if (tableWidth > parentWidth) {
        el.classList.add('is-scrollable')
      } else {
        el.classList.remove('is-scrollable')
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

        // 1. Freeze all column widths to pixel values based on current rendered size
        headers.forEach((headerTh) => {
          if (!headerTh.style.width) {
            headerTh.style.width = `${headerTh.getBoundingClientRect().width}px`
          }
        })

        // 2. Switch to fixed layout for drag support
        el.style.tableLayout = 'fixed'

        // 3. Set table width and minWidth to the sum of columns
        let totalWidth = 0
        headers.forEach((headerTh) => {
          const w = parseFloat(headerTh.style.width) || headerTh.getBoundingClientRect().width
          totalWidth += w
        })
        el.style.width = `${totalWidth}px`
        el.style.minWidth = `${totalWidth}px`

        const startWidth = th.getBoundingClientRect().width

        const onMouseMove = (moveEvent: MouseEvent) => {
          const deltaX = moveEvent.clientX - startX
          const newWidth = Math.max(50, startWidth + deltaX)
          
          th.style.width = `${newWidth}px`
          th.style.minWidth = `${newWidth}px`

          // Update table total width based on current columns
          let currentTotalWidth = 0
          headers.forEach((headerTh) => {
            const w = parseFloat(headerTh.style.width) || headerTh.getBoundingClientRect().width
            currentTotalWidth += w
          })
          el.style.width = `${currentTotalWidth}px`
          el.style.minWidth = `${currentTotalWidth}px`

          checkScrollable()
        }

        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove)
          document.removeEventListener('mouseup', onMouseUp)
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
