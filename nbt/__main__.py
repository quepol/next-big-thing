import argparse

from . import history, pipeline, summary
from .config import CONFIG
from .lastfm import LastFM


def main() -> None:
    p = argparse.ArgumentParser(prog="nbt", description="Next Big Thing: shows near you, scored against your Last.fm history")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("history", help="backfill / top up your scrobble history only")
    sub.add_parser("run", help="full daily run: history, events, scoring, digest")
    sub.add_parser("summary", help="sync history and print a taste-model sanity check")
    args = p.parse_args()

    if not CONFIG.lastfm_user:
        raise SystemExit("LASTFM_USER is not set")
    if args.cmd == "history":
        history.sync(LastFM())
    elif args.cmd == "run":
        pipeline.run()
    elif args.cmd == "summary":
        summary.run()


if __name__ == "__main__":
    main()
