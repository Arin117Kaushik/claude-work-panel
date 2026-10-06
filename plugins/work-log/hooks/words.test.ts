import { expect, test } from 'claude-code/testing'
import { countLine, tallyLines, words } from './words'

test('tool calls get plain words and counts', async () => {
  expect(words('WebSearch').now).toBe('Searching the web')
  expect(words('mcp__claude-in-chrome__navigate').now).toBe('Opening a page in Chrome')
  expect(words('mcp__claude-in-chrome__get_page_text').now).toBe('Reading the page in Chrome')
  expect(words('mcp__claude_ai_Gmail__trash_thread').now).toBe('Cleaning up email')
  expect(words('mcp__claude_ai_Notion__notion-fetch').now).toBe('Working in Notion')
  expect(countLine('search', 1)).toBe('1 web search done')
  expect(countLine('search', 4)).toBe('4 web searches done')
  expect(tallyLines({ page: 2, search: 4, other: 9 })).toEqual(['4 web searches done', '2 pages read'])
})
