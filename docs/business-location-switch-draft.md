# Business workspace location switching

Separate draft on the signup/newsletter candidate. This is a review branch; do not deploy it with the parent asset version. Assign a new shared cache version when composing and preparing the eventual release.

The owner selector now waits for **Open location**. The active location and unsaved hours/listing inputs stay intact on a failed switch or cancellation, and writes are locked while a switch is in progress. The owner endpoint checks the last observed active location when provided and returns a conflict if another tab switched first. No team roles, checkout, or paid capabilities are implied.

Local checks use the real Express business routes with a disposable database and isolated frontend DOM fixtures. Physical phone and hosted account acceptance remain open.
