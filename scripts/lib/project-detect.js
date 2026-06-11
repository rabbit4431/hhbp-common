'use strict';

const fs = require('fs');
const path = require('path');

const LANGUAGE_MARKERS = [
  { language: 'Java', files: ['pom.xml', 'build.gradle', 'build.gradle.kts'] },
  { language: 'Python', files: ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile'] },
  { language: 'TypeScript', files: ['tsconfig.json'] },
  { language: 'JavaScript', files: ['package.json'] },
  { language: 'Go', files: ['go.mod'] },
  { language: 'Rust', files: ['Cargo.toml'] },
  { language: 'Ruby', files: ['Gemfile'] },
  { language: 'PHP', files: ['composer.json'] },
  { language: 'C#', files: ['*.csproj', '*.sln'] },
];

const FRAMEWORK_MARKERS = [
  { framework: 'Spring Boot', files: ['pom.xml'], content: 'spring-boot' },
  { framework: 'React', files: ['package.json'], content: '"react"' },
  { framework: 'Vue', files: ['package.json'], content: '"vue"' },
  { framework: 'Angular', files: ['angular.json'] },
  { framework: 'Next.js', files: ['next.config.js', 'next.config.mjs', 'next.config.ts'] },
  { framework: 'Django', files: ['manage.py'] },
  { framework: 'Flask', files: ['app.py'], content: 'flask' },
  { framework: 'Rails', files: ['Gemfile'], content: 'rails' },
  { framework: 'Express', files: ['package.json'], content: '"express"' },
];

function detectProjectType(cwd) {
  const dir = cwd || process.cwd();
  const languages = [];
  const frameworks = [];

  for (const marker of LANGUAGE_MARKERS) {
    for (const file of marker.files) {
      if (file.includes('*')) {
        try {
          const entries = fs.readdirSync(dir);
          const ext = file.replace('*', '');
          if (entries.some(e => e.endsWith(ext))) {
            languages.push(marker.language);
            break;
          }
        } catch {
          // directory not readable
        }
      } else if (fs.existsSync(path.join(dir, file))) {
        languages.push(marker.language);
        break;
      }
    }
  }

  for (const marker of FRAMEWORK_MARKERS) {
    for (const file of marker.files) {
      const filePath = path.join(dir, file);
      if (!fs.existsSync(filePath)) continue;

      if (!marker.content) {
        frameworks.push(marker.framework);
        break;
      }

      try {
        const content = fs.readFileSync(filePath, 'utf8');
        if (content.includes(marker.content)) {
          frameworks.push(marker.framework);
          break;
        }
      } catch {
        // file not readable
      }
    }
  }

  return { languages, frameworks };
}

module.exports = { detectProjectType };
