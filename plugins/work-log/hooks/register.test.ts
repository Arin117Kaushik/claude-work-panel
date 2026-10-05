import { expect, test } from 'claude-code/testing'

test('pane says nothing yet when no tools ran', async ($, on) => {
  on('ui.render', () => ({ type: 'Box' as const }))

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
  expect(await ui.find({ type: 'Text', text: /no progress file yet/ })).toBeDefined()
  await ui.unmount()
})
