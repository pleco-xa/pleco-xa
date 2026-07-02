let queue = []
let container = null

function ensureContainer() {
  if (typeof document === 'undefined') return
  if (!container) {
    container = document.getElementById('toastContainer')
    if (!container) {
      container = document.createElement('div')
      container.id = 'toastContainer'
      container.setAttribute('aria-live', 'polite')
      container.style.position = 'fixed'
      container.style.top = '20px'
      container.style.right = '20px'
      container.style.display = 'flex'
      container.style.flexDirection = 'column'
      container.style.gap = '10px'
      container.style.zIndex = '1000'
      document.body.appendChild(container)
    }
  }
}

function showNext() {
  if (!container || container.childElementCount || queue.length === 0) return
  const { message, duration } = queue.shift()
  const div = document.createElement('div')
  div.className = 'toast-message'
  div.textContent = message
  container.appendChild(div)
  setTimeout(() => {
    div.remove()
    showNext()
  }, duration)
}

export function enqueueToast(message, duration = 3000) {
  ensureContainer()
  queue.push({ message, duration })
  showNext()
}
