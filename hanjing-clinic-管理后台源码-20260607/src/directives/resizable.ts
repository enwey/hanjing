import { Directive } from 'vue'

export const resizable: Directive = {
  mounted(el: HTMLTableElement) {
    if (el.tagName !== 'TABLE') return

    const parent = el.parentElement
    if (parent) {
      parent.style.overflowX = 'auto'
      parent.style.width = '100%'
    }

    el.style.tableLayout = 'fixed'
    el.style.minWidth = '100%'

    const headers = Array.from(el.querySelectorAll('thead th')) as HTMLElement[]
    if (headers.length <= 1) return

    // Freeze initial widths to pixel values if not set
    headers.forEach((th) => {
      if (!th.style.width && !th.getAttribute('width')) {
        th.style.width = `${th.getBoundingClientRect().width}px`
      }
    })

    const checkScrollable = () => {
      if (!parent) return
      
      // Calculate total columns width by summing the parsed width of all header elements
      let totalWidth = 0
      headers.forEach((th) => {
        const w = parseFloat(th.style.width) || th.getBoundingClientRect().width
        totalWidth += w
      })
      
      el.style.width = `${totalWidth}px`
      el.style.minWidth = `${totalWidth}px`
      
      const parentWidth = parent.clientWidth
      
      // Add scrollable style if total column width exceeds container width
      if (totalWidth > parentWidth) {
        el.classList.add('is-scrollable')
      } else {
        el.classList.remove('is-scrollable')
      }
    }

    // Run check after mount layout settles
    setTimeout(checkScrollable, 50)

    // Listen to window resize
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
        const startWidth = th.getBoundingClientRect().width

        // Freeze all header th widths to prevent browser auto-shifting
        headers.forEach((headerTh) => {
          if (!headerTh.style.width) {
            headerTh.style.width = `${headerTh.getBoundingClientRect().width}px`
          }
        })

        const onMouseMove = (moveEvent: MouseEvent) => {
          const deltaX = moveEvent.clientX - startX
          const newWidth = Math.max(50, startWidth + deltaX)
          
          th.style.width = `${newWidth}px`
          th.style.minWidth = `${newWidth}px`

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
