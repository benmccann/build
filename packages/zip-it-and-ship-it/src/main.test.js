const { readFile, chmod } = require('fs')
const { tmpdir } = require('os')
const { platform } = require('process')

const test = require('ava')
const { dir: getTmpDir, tmpName } = require('tmp-promise')
const del = require('del')
const cpy = require('cpy')
const promisify = require('util.promisify')
const pathExists = require('path-exists')
const commonPathPrefix = require('common-path-prefix')
const execa = require('execa')

const { zipNode, zipFixture, unzipFiles, zipCheckFunctions, FIXTURES_DIR } = require('./helpers/main.js')

const { zipFunction } = require('..')

const pReadFile = promisify(readFile)
const pChmod = promisify(chmod)

test.after(async () => {
  await del(`${tmpdir()}/zip-it-test*`, { force: true })
})

test('Zips Node.js function files', async t => {
  const { files } = await zipNode(t, 'simple')
  t.true(files.every(({ runtime }) => runtime === 'js'))
})

test('Zips node modules', async t => {
  await zipNode(t, 'node-module')
})

test('Can require node modules', async t => {
  await zipNode(t, 'local-node-module')
})

test('Can require scoped node modules', async t => {
  await zipNode(t, 'node-module-scope')
})

test('Can require node modules nested files', async t => {
  await zipNode(t, 'node-module-path')
})

test('Ignore some excluded node modules', async t => {
  const { tmpDir } = await zipNode(t, 'node-module-excluded')
  t.false(await pathExists(`${tmpDir}/node_modules/aws-sdk`))
})

test('Throws on runtime errors', async t => {
  await t.throwsAsync(zipNode(t, 'node-module-error'))
})

test('Throws on missing dependencies', async t => {
  await t.throwsAsync(zipNode(t, 'node-module-missing'))
})

test('Throws on missing dependencies with no optionalDependencies', async t => {
  await t.throwsAsync(zipNode(t, 'node-module-missing-package'))
})

test.skip('Ignore missing optional dependencies', async t => {
  await zipNode(t, 'node-module-optional')
})

test.skip('Ignore missing whitelisted optional dependencies', async t => {
  await zipNode(t, 'node-module-optional-whitelist')
})

test('Can require local files', async t => {
  await zipNode(t, 'local-require')
})

test('Can require local files deeply', async t => {
  await zipNode(t, 'local-deep-require')
})

test.skip('Can require local files in the parent directories', async t => {
  await zipNode(t, 'local-parent-require')
})

test('Can target a directory with a handler with the same name', async t => {
  await zipNode(t, 'directory-handler')
})

test.skip('Can target a directory with an index.js file', async t => {
  const { files, tmpDir } = await zipFixture(t, 'index-handler')
  await unzipFiles(files)
  t.true(require(`${tmpDir}/index.js`))
})

test.skip('Keeps non-required files inside the target directory', async t => {
  const { tmpDir } = await zipNode(t, 'keep-dir-files')
  t.true(await pathExists(`${tmpDir}/file.js`))
})

test.skip('Ignores non-required node_modules inside the target directory', async t => {
  const { tmpDir } = await zipNode(t, 'ignore-dir-node-modules')
  t.false(await pathExists(`${tmpDir}/node_modules`))
})

test.skip('Ignores deep non-required node_modules inside the target directory', async t => {
  const { tmpDir } = await zipNode(t, 'ignore-deep-dir-node-modules')
  t.false(await pathExists(`${tmpDir}/deep/node_modules`))
})

test('Works with many dependencies', async t => {
  await zipNode(t, 'many-dependencies')
})

test('Works with many function files', async t => {
  await zipNode(t, 'many-functions', 6)
})

test.skip('Throws when the source folder does not exist', async t => {
  await t.throwsAsync(zipNode(t, 'does-not-exist'), /Functions folder does not exist/)
})

test('Works even if destination folder does not exist', async t => {
  await zipNode(t, 'simple')
})

test('Do not consider node_modules as a function file', async t => {
  await zipNode(t, 'ignore-node-modules')
})

test('Ignore non-handler directories', async t => {
  await zipNode(t, 'ignore-directories')
})

test('Works on empty directories', async t => {
  await zipNode(t, 'empty', 0)
})

test.skip('Works when no package.json is present', async t => {
  const tmpDir = await tmpName({ prefix: 'zip-it-test' })
  const files = await cpy(`${FIXTURES_DIR}/no-package-json`, `${tmpDir}/no-package-json`, { parents: true })
  const commonDir = commonPathPrefix(files)
  await zipNode(t, 'no-package-json', 1, {}, `${commonDir}/..`)
})

test.skip('Copies already zipped files', async t => {
  const tmpDir = await tmpName({ prefix: 'zip-it-test' })
  const { files } = await zipCheckFunctions(t, 'keep-zip', tmpDir)

  t.true(files.every(({ runtime }) => runtime === 'js'))
  t.true(
    (await Promise.all(files.map(async ({ path }) => (await pReadFile(path, 'utf8')).trim() === 'test'))).every(Boolean)
  )
})

test('Zips Go function files', async t => {
  const { files, tmpDir } = await zipFixture(t, 'go-simple')

  t.true(files.every(({ runtime }) => runtime === 'go'))

  await unzipFiles(files)

  const unzippedFile = `${tmpDir}/test`

  await pathExists(unzippedFile)

  // The library we use for unzipping does not keep executable permissions.
  // https://github.com/cthackers/adm-zip/issues/86
  // However `chmod()` is not cross-platform
  if (platform === 'linux') {
    await pChmod(unzippedFile, 0o755)

    const { stdout } = await execa(unzippedFile)
    t.is(stdout, 'test')
  }
})

test('Can skip zipping Go function files', async t => {
  const { files } = await zipFixture(t, 'go-simple', 1, { skipGo: true })

  t.true(files.every(({ runtime }) => runtime === 'go'))
  t.true(
    (await Promise.all(files.map(async ({ path }) => !path.endsWith('.zip') && (await pathExists(path))))).every(
      Boolean
    )
  )
})

test('Ignore unsupported programming languages', async t => {
  await zipFixture(t, 'unsupported', 0)
})

test('Can reduce parallelism', async t => {
  await zipNode(t, 'simple', 1, { parallelLimit: 1 })
})

test.skip('Can use zipFunction()', async t => {
  const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
  const { runtime } = await zipFunction(`${FIXTURES_DIR}/simple/function.js`, tmpDir)
  t.is(runtime, 'js')
})
