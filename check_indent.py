import sys

filepath = r'G:\code\pixsim7\pixsim7\backend\main\api\v1\assets.py'

with open(filepath, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f, 1):
        if line.strip() and not line.lstrip().startswith('#'):
            spaces = len(line) - len(line.lstrip())
            # Check for non-standard indentation (not multiples of 4)
            if spaces > 0 and spaces % 4 != 0:
                print(f'Line {i}: {spaces} spaces - {line[:80].rstrip()}')
