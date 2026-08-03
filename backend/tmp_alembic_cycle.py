from alembic.config import Config
from alembic import command

cfg = Config('alembic.ini')
print('Current before cycle:')
command.current(cfg, verbose=True)

print('\nDowngrading one revision...')
try:
    command.downgrade(cfg, '-1')
    print('Downgrade succeeded')
except Exception as e:
    print('Downgrade failed:', type(e).__name__, e)

print('\nCurrent after downgrade:')
command.current(cfg, verbose=True)

print('\nUpgrading to head...')
try:
    command.upgrade(cfg, 'head')
    print('Upgrade succeeded')
except Exception as e:
    print('Upgrade failed:', type(e).__name__, e)

print('\nCurrent after upgrade:')
command.current(cfg, verbose=True)
