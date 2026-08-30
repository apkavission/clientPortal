import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
    This project is its own workspace root.

    Turbopack otherwise walks up looking for a lockfile and finds one in the
    home directory, left there by an unrelated install. An inferred root that
    high means resolution and file watching cover everything under it.
  */
  turbopack: {
    root: __dirname,
  },

  /*
    Where the build output goes.

    `next dev` and `next build` both write to `.next`, so building while the dev
    server is running leaves it serving a half-replaced manifest — routes that
    exist start answering 404, and the obvious conclusion is that the routing is
    broken. It is not; it is two processes writing one directory.

    Default behaviour is unchanged. A verification build sets NEXT_DIST_DIR and
    lands somewhere the dev server is not reading.
  */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
