#!/usr/bin/env python3
"""Builds everything that comes from the Google Sheet "IMPACT Website Content" (called by the workflow content-sync).
Add further builders here, so the workflow file never has to change."""
import os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
for script, args in (('build_team.py', []), ('ct_courses.py', ['build'])):
    r = subprocess.run([sys.executable, os.path.join(HERE, script)] + args)
    if r.returncode:
        sys.exit(r.returncode)
