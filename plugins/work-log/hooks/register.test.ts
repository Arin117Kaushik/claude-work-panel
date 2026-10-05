import { expect, test } from 'claude-code/testing'

test('pane shows the timer even with no plan', async ($, on) => {
  on('ui.render', () => ({ type: 'Box' as const }))
  on('clock.now', () => ({ value: 0 }))

  const ui = await $.ui.mount({
    plugin: 'work-log',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'work-log',
    props: {
      title: 'Work',
      isFocused: false,
      bodyColumns: 60,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 20 },
      view: {},
    },
  })
  expect(await ui.find({ type: 'Text', text: /TIMER/ })).toBeDefined()
  await ui.unmount()
})
