import unittest
import pandas as pd
from indicators import FEATURES, stable_mapping


class IndicatorTests(unittest.TestCase):
    def test_splits_merges_and_zero_population_are_not_silently_joined(self):
        pairs = pd.DataFrame([
            ["old1", "new1", 100, 50],
            ["old2", "new2", 50, 25], ["old2", "new3", 50, 25],
            ["old3", "new4", 50, 25], ["old4", "new4", 50, 25],
            ["old5", "new5", 0, 0],
            ["old6", "new6", 100, 1], ["old6", "new7", 0, 99],
        ], columns=["geoid10", "geoid20", "pop20", "hu20"])
        self.assertEqual(stable_mapping(pairs), {"old1": "new1"})

    def test_feature_allowlist_excludes_outcomes_and_future_status(self):
        for name in FEATURES:
            self.assertFalse(name.startswith(("out_", "post_", "diag_")))
            self.assertNotIn("2024", name)
            self.assertNotIn("eligible", name)
            self.assertNotIn("designated", name)


if __name__ == "__main__":
    unittest.main()
