/**
 * Resolves on the next animation frame — or after `maxWait` ms if frames are
 * paused. Chromium stops requestAnimationFrame while the window is minimised
 * or hidden, and work that waits on it (like export) would stall until the
 * window came back.
 */
export function nextFrame(maxWait = 50): Promise<void> {
  return new Promise(resolve => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    requestAnimationFrame(finish)
    setTimeout(finish, maxWait)
  })
}
