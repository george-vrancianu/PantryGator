// Pre-commit (see .husky/pre-commit). One function sorts the staged files, so no file is handled by
// two commands at once, and lint always runs before Prettier for the same file. Only staged files
// are touched; nothing is auto-fixed. lint-staged passes absolute paths.
import path from 'node:path';

const quote = (files) => files.map((file) => JSON.stringify(file)).join(' ');
const relative = (file) =>
  path
    .relative(import.meta.dirname, file)
    .split(path.sep)
    .join('/');

const isWebOrUi = (file) => /^(apps\/web|packages\/ui)\/.*\.tsx?$/.test(file);
const isApi = (file) => /^apps\/api\/(src|test)\/.*\.ts$/.test(file);
// Same scope as `npm run lint` (the src folders); other web/ui .ts files still get Prettier.
// The import-rule self-test fixtures break the rules on purpose (scripts/check-lint-rules.mjs).
const isLinted = (file) =>
  /^(apps\/web|packages\/ui)\/src\/.*\.tsx?$/.test(file) &&
  !file.includes('/lintSelfTest/');
const isFormatted = (file) => /\.(tsx?|mjs|json|ya?ml)$/.test(file);

export default {
  '*': (files) => {
    const web = files.filter((file) => isWebOrUi(relative(file)));
    const linted = web.filter((file) => isLinted(relative(file)));
    const api = files.filter((file) => isApi(relative(file)));
    const other = files.filter(
      (file) => isFormatted(file) && !web.includes(file) && !api.includes(file),
    );
    const commands = [];
    // Web and UI: oxlint with the shared root .oxlintrc.json.
    if (linted.length) {
      commands.push(
        `oxlint -c .oxlintrc.json --report-unused-disable-directives-severity error ${quote(linted)}`,
      );
    }
    // API: ESLint with apps/api's own type-aware config, so it runs from apps/api. Prettier is off
    // inside ESLint because the Prettier step below formats the files anyway.
    if (api.length) {
      commands.push(
        `bash -c 'cd apps/api && eslint --config eslint.config.mjs --rule "prettier/prettier: off" "$@"' _ ${quote(api)}`,
      );
    }
    const formatted = [...web, ...api, ...other];
    if (formatted.length) commands.push(`prettier --write ${quote(formatted)}`);
    return commands;
  },
};
