# Writing a CTF

Each season of CARRiER can carry a CTF: a chain of flags hidden across the
phone network. A flag is a file on a host. Reading it records it, pays rep
and cash (full to the first reader, 60% to the second, 30% after that), and
its text points to the next flag. The first player to read every flag gets
a bonus and goes in the Hall of Fame. If nobody finds the next flag for 3
days, the Scene Daily drops a hint; at 6 days, a stronger one.

CARRiER comes with one CTF, **Long Distance** (five flags: a dot file in
uucppublic, a root-only ROT13 file on the machine the first one calls, a
`.plan`, a string inside a program, and a file on a VAX). You can write
your own.

## Where it goes

Put a JSON file in `scripts/data/carrier/ctf/` in your ViSiON/3 install,
for example `scripts/data/carrier/ctf/midnight.json`. With one or more files
there, each season runs the next one in turn, by file name. To pick one, set
`ctf=midnight` in the door's `args`; `ctf=off` turns CTFs off. A file that
can't be read or doesn't check out is skipped, and the built-in one runs
instead.

## The format

```json
{
    "id": "midnight",
    "title": "Midnight Run",
    "bonus": 200,
    "start": "A new CTF is on: the first flag is on a university box, {num.1}.",
    "flags": [
        {
            "host": { "kind": "unix", "prof": "edu" },
            "path": "/tmp/.midnight",
            "text": "{flag}\nThe next one is root's on the machine this one calls.\n",
            "hint1": "The first flag is a dot file in /tmp on {num.1}.",
            "hint2": "ls -a /tmp on {name.1}, {num.1}.",
            "rep": 40,
            "cash": 25
        },
        {
            "host": { "lead": 1, "kind": "unix" },
            "path": "/etc/.midnight",
            "priv": true,
            "encode": "rot13",
            "text": "{flag}\nThat's it.\n",
            "hint1": "Flag two is root's, on the machine {name.1} calls at night.",
            "hint2": "/etc/.midnight on {num.2}, in ROT13."
        }
    ]
}
```

- **id**: letters, digits, `_` and `-`, up to 24. **title**: what players
  see. **bonus**: rep for reading every flag (a third of it after the
  first finisher). **start**: the Scene Daily's word when the season
  begins.
- **flags**: up to 12, in order. Each one:
  - **host**: where it goes. The network is new every season, so name the
    kind of host and CARRiER finds one from the season's seed:
    - `{ "kind": "unix", "prof": "edu" }`: a host of that kind (`unix`,
      `vms`, `prime`, `hp3000`) in an exchange of that profile (`edu`,
      `biz`, `gov`, `telco`, `res`), with an account a caller can get in
      on.
    - `{ "lead": 1, "kind": "unix" }`: a machine flag 1's host calls (in its
      uucp `Systems` or `L.sys`), so reading that file is part of the hunt.
    - `{ "num": "6172530042" }`: a fixed number, such as a landmark.
  - **place**: `file` (the default), `plan` (in the `.plan` of one of the
    host's staff, read with `cat` or `finger`; UNIX only) or `strings`
    (inside a program at `path`; `strings` shows it, `cat` shows noise).
  - **path**: the file's full path (not for `plan`). On VMS,
    `DUA0:[PUBLIC]FLAG.TXT` is `/PUBLIC/FLAG.TXT`.
  - **priv**: only root (or SYSTEM) can read it.
  - **encode**: `plain` (the default) or `rot13`.
  - **text**: what the file says. Point it at the next flag.
  - **hint1**, **hint2**: the Scene Daily's hints, the second plainer.
  - **rep**, **cash**: the full reward (default 40 and $25).

In `text`, `start` and the hints, these are filled in:

| Placeholder | Becomes |
|---|---|
| `{flag}` | the flag's token, like `CTF{3fa91c07}` |
| `{num.N}` | flag N's phone number |
| `{name.N}` | flag N's host name |
| `{user.N}` | the user whose `.plan` holds flag N |
| `{path.N}` | flag N's path |

## How it plays

- Players can't change or delete a flag for good, or anything on the way
  to one: whatever they do to it lasts only their call.
- The admins' daily sweep doesn't touch flags.
- Rankings show how many flags you have and who finished first.
- A new season forgets the old CTF's progress. The Hall of Fame keeps who
  won it.
