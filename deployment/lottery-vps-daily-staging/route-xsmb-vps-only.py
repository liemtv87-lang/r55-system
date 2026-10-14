#!/usr/bin/env python3
"""Stage Caddy route for XSMB immutable VPS snapshots. Preserve XS MT/MN and licensed customer gate."""
import pathlib,sys
source=pathlib.Path('/opt/kq247/deployment/football-staging/Caddyfile')
original=source.read_text()
old="""  @lottery_paths {
    path /xoso /xoso/ /xoso-khach /xoso-khach/ /lottery/*
  }
  handle @lottery_paths {
    reverse_proxy lottery-original:3004
  }
"""
new="""  # XSMB public page reads ONLY immutable PostgreSQL-exported snapshot.
  # XSMT/XSMN remain on existing route until their local archives are migrated.
  @xsmb_page_path {
    path /xoso /xoso/
  }
  @xsmt_page_query {
    query region=xsmt
  }
  @xsmn_page_query {
    query region=xsmn
  }
  handle @xsmb_page_path {
    route {
      reverse_proxy @xsmt_page_query lottery-original:3004
      reverse_proxy @xsmn_page_query lottery-original:3004
      reverse_proxy kq247-xsmb-snapshot-reader:3018
    }
  }
  # Never alter licensed customer activation, existing device codes or other regions.
  @lottery_paths {
    path /xoso-khach /xoso-khach/ /lottery/*
  }
  handle @lottery_paths {
    reverse_proxy lottery-original:3004
  }
"""
if old not in original:
 if new in original: print('CADDY_XSMB_ROUTE_ALREADY_STAGED');sys.exit(0)
 raise SystemExit('CURRENT_CADDY_LOTTERY_BLOCK_MISMATCH')
staged=source.with_name('Caddyfile.xsmb-lock-verified')
staged.write_text(original.replace(old,new))
print('CADDY_XSMB_PATCH_STAGED',staged,'bytes',staged.stat().st_size)
