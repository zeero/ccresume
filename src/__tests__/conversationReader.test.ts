import { pathToClaudeDir } from '../utils/conversationReader.js';

describe('conversationReader', () => {
  describe('pathToClaudeDir', () => {
    it('converts / to -', () => {
      expect(pathToClaudeDir('/Users/foo/bar')).toBe('-Users-foo-bar');
    });

    it('converts . to -', () => {
      expect(pathToClaudeDir('/my.project')).toBe('-my-project');
    });

    it('converts _ to -', () => {
      expect(pathToClaudeDir('/foo_bar')).toBe('-foo-bar');
    });

    it('converts compound path with /, ., and _', () => {
      expect(pathToClaudeDir('/Users/foo_bar/my.project')).toBe('-Users-foo-bar-my-project');
    });
  });
});
