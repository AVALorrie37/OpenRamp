export type PreferenceKey = 'bug_fix' | 'feature' | 'docs' | 'community' | 'review' | 'test'

export function getPreferenceTypes(lang: 'chinese' | 'english') {
  return lang === 'english'
    ? {
        bug_fix: { label: 'Bug fixes', description: 'Like fixing code errors and defects' },
        feature: { label: 'Feature development', description: 'Like developing new features' },
        docs: { label: 'Documentation', description: 'Like improving project docs' },
        community: { label: 'Community', description: 'Like answering questions and helping others' },
        review: { label: 'Code review', description: 'Like reviewing code quality' },
        test: { label: 'Testing', description: 'Like writing test cases' }
      }
    : {
        bug_fix: { label: 'Bug修复', description: '喜欢修复代码错误和缺陷' },
        feature: { label: '功能开发', description: '喜欢开发新功能和特性' },
        docs: { label: '文档编写', description: '喜欢完善项目文档和说明' },
        community: { label: '社区建设', description: '喜欢回答问题和帮助他人' },
        review: { label: '代码审查', description: '喜欢审查代码质量' },
        test: { label: '测试编写', description: '喜欢编写测试用例' }
      }
}
