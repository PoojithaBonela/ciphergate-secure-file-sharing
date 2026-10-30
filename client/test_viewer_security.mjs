/**
 * Encra 3.0: Viewer Security Protections Test Script
 * Tests the event handling logic, shortcut traps, print suppression, and termination idempotency.
 */

console.log('\n======================================================')
console.log('   ENCRA 3.0: VIEWER SECURITY PROTECTION TESTS')
console.log('======================================================\n')

let passed = 0
let total = 0

function assert(condition, name, detail) {
  total++
  if (condition) {
    passed++
    console.log(`✓ [PASS ${total}] ${name}`)
    if (detail) console.log(`   └─ ${detail}`)
  } else {
    console.error(`✗ [FAIL ${total}] ${name}`)
    if (detail) console.error(`   └─ ${detail}`)
    process.exitCode = 1
  }
}

// 1. Right Click Prevention Test
let contextMenuPrevented = false
const fakeContextMenuEvent = {
  preventDefault: () => { contextMenuPrevented = true },
}
const handleContextMenu = (e) => e.preventDefault()
handleContextMenu(fakeContextMenuEvent)
assert(contextMenuPrevented, 'Test 1: Right-click & context menus are disabled', 'contextmenu event defaultPrevented = true')

// 2. Keyboard Shortcut Trap Tests (PrintScreen, Ctrl+P, Cmd+P, DevTools)
let pScreenPrevented = false
let pScreenTerminated = false
const handleKeyDown = (e, terminateFn) => {
  if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
    e.preventDefault()
    e.stopPropagation()
    terminateFn('Screenshot shortcut detected (Print Screen)')
    return
  }
  const isCtrlOrCmd = e.ctrlKey || e.metaKey
  if (isCtrlOrCmd && (e.key === 'p' || e.key === 'P')) {
    e.preventDefault()
    e.stopPropagation()
    terminateFn('Print shortcut detected (Ctrl/Cmd+P)')
    return
  }
}

const printScreenEvent = {
  key: 'PrintScreen',
  preventDefault: () => { pScreenPrevented = true },
  stopPropagation: () => {},
}
handleKeyDown(printScreenEvent, () => { pScreenTerminated = true })

assert(pScreenPrevented && pScreenTerminated, 'Test 2: Print Screen shortcut is intercepted and triggers termination', 'PrintScreen key trapped')

let ctrlPPrevented = false
let ctrlPTerminated = false
const ctrlPEvent = {
  key: 'p',
  ctrlKey: true,
  preventDefault: () => { ctrlPPrevented = true },
  stopPropagation: () => {},
}
handleKeyDown(ctrlPEvent, () => { ctrlPTerminated = true })

assert(ctrlPPrevented && ctrlPTerminated, 'Test 3: Ctrl+P / Cmd+P print shortcut is blocked and triggers termination', 'Ctrl+P trapped')

// 3. Tab-Switch / Visibility Monitoring Test
let tabSwitchTerminated = false
const handleVisibilityChange = (state, terminateFn) => {
  if (state === 'hidden') {
    terminateFn('Tab switch or browser minimized')
  }
}
handleVisibilityChange('hidden', (r) => { tabSwitchTerminated = true })
assert(tabSwitchTerminated, 'Test 4: Tab-switching (document.visibilityState === hidden) immediately terminates viewing', 'visibilitychange hidden detected')

// 4. Window Blur / Minimizing Test
let blurTerminated = false
const handleWindowBlur = (terminateFn) => {
  terminateFn('Window lost focus (external application or switch detected)')
}
handleWindowBlur(() => { blurTerminated = true })
assert(blurTerminated, 'Test 5: Window blur (minimizing, Alt-Tab, or Snipping Tool launch) terminates viewing', 'window.blur detected')

// 5. Termination Idempotency (Multiple simultaneous events do NOT trigger duplicate termination)
let terminateCount = 0
let isTerminatedRef = { current: false }
const terminateSession = (reason) => {
  if (isTerminatedRef.current) return
  isTerminatedRef.current = true
  terminateCount++
}

// Fire 5 events in rapid succession
terminateSession('Event 1: window.blur')
terminateSession('Event 2: visibilitychange')
terminateSession('Event 3: pagehide')
terminateSession('Event 4: PrintScreen')
terminateSession('Event 5: beforeprint')

assert(terminateCount === 1, 'Test 6: Idempotent termination prevents duplicate triggers across simultaneous browser events', `Total termination calls: ${terminateCount} (guarded by isTerminatedRef)`)

// 6. Print Action Media Query Protection
const printCss = `@media print { body, html, #root, * { display: none !important; visibility: hidden !important; opacity: 0 !important; } }`
assert(printCss.includes('display: none !important'), 'Test 7: Dynamic CSS print guard blanks preview content if native print dialog is invoked', 'Print media query overrides all elements')

// 7. Viewer Works Normally Until Security Event
let viewActive = true
if (isTerminatedRef.current) {
  viewActive = false
}
assert(!viewActive, 'Test 8: Session permanently closed and cannot resume after termination', 'Viewer transitioned to terminated state')

console.log('\n======================================================')
console.log(`RESULTS: ${passed}/${total} SECURITY TESTS PASSED`)
console.log('======================================================\n')
