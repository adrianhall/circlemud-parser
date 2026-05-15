# Command Line Reference

This document describes the shape of the command line.

## Basic Usage Pattern

```bash
npx circlemud-parser [args] <input-file>
```

The input file can be one of the following:

- A single MUD data file (e.g. a .zon, .wld, etc file)
- An index file (such as `data/tbamud/lib/world/zon/index.mini`)
- A directory containing the world files (such as `data/tbamud/lib/world`)

For index files, we are converting an entire MUD data set for a single data type. The index file is a list of files to convert that are in the same directory as the index file, terminated by a `$` on a line.

For directories, we are converting an entire MUD data set. We look for index files in each of `(mob|obj|qst|shp|trg|wld|zon)` and convert each index file as above.

## Arguments

There are several sets of arguments:

### Output

By default, each data file is converted into the equivalent JSON by appending `.json` to the end. For example, `30.zon` would become `30.zon.json`. We can adjust this by setting the output directory using either `-O` or `--output-directory`:

```bash
npx circlemud-parser -O data/json data/tbamud/lib/world
```

When doing the entire world, the directory structure is mirrored, so this would create files, for example, in `data/json/mob`, `data/json/obj`, etc and each one would be named things like `30.mob.json`. Output subdirectories are created automatically when they do not exist.

When doing something less than the entire world, the directory structure is ignored. For example:

```bash
npx circlemud-parser -O data/json data/tbamud/lib/world/zon/30.zon
```

This would create the file `data/json/30.zon.json`.

We can also modify the output with `-f` or `--format`:

```bash
npx circlemud-parser -O data/json -f json data/tbamud/lib/world
```

We will support `(json|yaml|toml)` for export formats. The file extension used will change accordingly. By default, we output JSON.

### Logging

The logger provides four levels - debug, info, warn, and error.

- Use `-l <level>` or `--min-log-level <level>` to set the minimum log level.
- Use `-q` or `--quiet` to remove all logging
- Use `-v` or `--verbose` to set the minimum log level to debug.
- Use `--no-color` to remove color from the logged messages.

These three options (`-q`, `-v`, `-l`) are mutually exclusive. Using more than one produces a usage error (exit code 2).

Logs are output in color (using `chalk`) unless explicitly requested without color. Logs are not timestamped: just `[level] <file#line> <message> <optional-extra-data>` is output. If a field is not available, it is not output.

### Error Handling

You can decide what to do when the parser encounters a warning or error:

- Use `--stop-on-error` to stop parsing and exit if the parser encounters an error
- Use `--stop-on-warning` to stop parsing and exit if the parser encounters a warning or error

When stopping, any incomplete files will be removed. The error or warning will still be printed per the normal logging rules (see above) so you should be able to see the file and line number that caused the error or warning.

### Clobber control

Use the following to prevent clobbering:

- `--skip-if-exists` will skip parsing if the destination file already exists.
- `--overwrite` will overwrite the destination file.

These two options are mutually exclusive. Using both produces a usage error (exit code 2).

### Index file handling

- `--skip-if-missing` will skip a file if it is missing, which emits a warning.
- `--index-name <name>` sets the index file name to look for inside each world subdirectory during a directory walk. The default is `index`. A common alternative is `index.mini`.

Normally, an error is produced when a referenced file does not exist. If you are stopping on warnings, then this is still a warning, so will exit anyway.

### Exit Codes

- `0` — success.
- `1` — parser error or stop-on-warning triggered.
- `2` — CLI usage error (missing input, invalid flags, conflicting options).

### Default Arguments

The user MUST specify an input file or directory. In addition, the output directory is "the same directory as the input file is stored in" unless changed. Here are the other default arguments:

- `--color`
- `--format json`
- `--index-name index`
- `--min-log-level info`
- `--no-stop-on-warning`
- `--skip-if-exists`
- `--skip-if-missing`
- `--stop-on-error`
