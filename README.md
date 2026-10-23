# spiral: Network Intrusion Detection
 
A machine learning study of network intrusion detection. The model labels each network connection as **normal** or **attack**, and the project looks closely at where it fails: attack types it never saw in training.
 
**Main finding:** the choice of model (Random Forest, XGBoost, Logistic Regression) matters much less than two other things: the decision cutoff, and whether an attack type appeared in the training data.
 
## Dataset
 
- **NSL-KDD**, a cleaned version of the KDD Cup 1999 intrusion data. Original source: the Canadian Institute for Cybersecurity (UNB). This project uses a Kaggle copy in `.parquet` format: https://www.kaggle.com/datasets/dhoogla/nslkdd
- Train: 125,973 rows. Test: 22,544 rows. 36 features after dropping the label columns (3 categorical, 33 numeric).
- The Kaggle copy has fewer columns than the original 41 features, so scores are **not directly comparable** with published results.
- The test file contains **17 attack types that never appear in the training file** (for example `mscan`, `apache2`, `processtable`, `mailbomb`, `snmpguess`). This is the main source of difficulty.
- The training file has 5,843 duplicate rows.
- The data is not included in this repo. Download `KDDTrain.parquet` and `KDDTest.parquet` into a `data/` folder.
## Approach
 
1. One-hot encoding for `protocol_type`, `service`, `flag`; standard scaling for numeric columns. The label column `class` and the difficulty-style column `classnum` are dropped from the features to avoid leakage.
2. Binary target: 0 = normal, 1 = attack.
3. Three models trained with the same preprocessing: Random Forest, XGBoost, Logistic Regression.
4. Analysis of recall on **seen** vs **unseen** attack types, and of the decision cutoff.
5. A validation split that holds out four attack types (`satan`, `back`, `warezclient`, `pod`) to choose a cutoff without using the test set.
6. Extra experiments: row weights by attack type, duplicate removal, repeated runs with different random seeds, feature importance.
## Results
 
All numbers are on the official test file (22,544 rows: 9,711 normal and 12,833 attack).
 
### Model comparison at the default cutoff (0.5)
 
| Model | Accuracy | Attack precision | Attack recall | Missed attacks | False alarms |
|---|---|---|---|---|---|
| Random Forest | 0.790 | 0.969 | 0.652 | 4,469 | 266 |
| Logistic Regression | 0.752 | 0.916 | 0.621 | 4,863 | 734 |
| XGBoost | 0.794 | 0.968 | 0.660 | 4,368 | 282 |
 
The differences between Random Forest and XGBoost are within the run-to-run noise (see below). Logistic Regression is clearly weaker.
 
### Unseen attacks are the real limit
 
At the default cutoff, Random Forest catches about 78% of attacks whose type it saw in training, but only about 34% of attacks whose type it did not.
 
| Cutoff | Recall on seen attack types | Recall on unseen attack types |
|---|---|---|
| 0.50 | 0.785 | 0.342 |
| 0.40 | 0.791 | 0.422 |
| 0.10 | 0.896 | 0.864 |
| 0.05 | 0.934 | 0.901 |
 
Lowering the cutoff recovers most unseen attacks. At cutoff 0.1, the largest gains come from `processtable`, `mscan`, `snmpguess` and `apache2`. Two types stay missed even then: `mailbomb` (293 test rows, 4% caught) and `snmpgetattack` (178 rows, 0% caught). My guess, which I have not tested, is that they resemble ordinary mail and SNMP traffic.
 
### The cost of a lower cutoff (Random Forest, seed 42)
 
| Cutoff | Attack recall | Attack precision | Missed attacks | False alarms |
|---|---|---|---|---|
| 0.5 | 0.655 | 0.969 | 4,421 | 266 |
| 0.4 | 0.684 | 0.970 | 4,061 | 274 |
| 0.3 | 0.724 | 0.938 | 3,541 | 617 |
| 0.2 | 0.805 | 0.924 | 2,498 | 856 |
| 0.1 | 0.887 | 0.923 | 1,452 | 948 |
| 0.05 | 0.924 | 0.920 | 969 | 1,037 |
 
About 2.7% of normal traffic is flagged at cutoff 0.5, and about 10% at cutoff 0.1 or lower. This table is computed on the test set to show the trade-off; it is not a tuned result. (The 0.5 row shows 4,421 missed rather than 4,469 because `predict()` sends exact 50/50 votes to "normal" while `probability >= 0.5` sends them to "attack"; 48 attacks fall exactly on 0.5.)
 
### A validation split could not predict false alarms
 
I chose a cutoff on a validation split built from the training file, with four attack types held out. On that split, false alarms looked tiny. On the real test file, the same model flagged far more normal traffic:
 
| Cutoff | False-alarm rate on validation normals | False-alarm rate on test normals |
|---|---|---|
| 0.5 | 0.0% | 1.6% |
| 0.1 | 0.4% | 8.6% |
| 0.05 | 0.8% | 9.8% |
 
Normal traffic in the test file looks different from normal traffic in the training file, so a cutoff tuned on one cannot promise a false-alarm budget on the other. Only 2% of validation normal rows also appeared in the fit set, so duplicate leakage is not the main cause. In a real deployment the cutoff would need to be calibrated on that network's own normal traffic.
 
### Weighting rows by attack type
 
Rare attack types (for example 53 `guess_passwd` rows vs 41,214 `neptune` rows) get more weight during training. Weight is 1 divided by the square root of the type's row count.
 
| Seed | Missed @ 0.5 (unweighted to weighted) | Missed @ 0.05 (unweighted to weighted) | False alarms @ 0.5 | False alarms @ 0.05 |
|---|---|---|---|---|
| 1 | 4,502 to 3,955 | 819 to 557 | 264 to 275 | 1,049 to 1,103 |
| 2 | 4,551 to 4,209 | 1,064 to 694 | 267 to 275 | 1,045 to 1,076 |
| 3 | 4,508 to 4,412 | 1,051 to 898 | 268 to 272 | 1,056 to 1,097 |
| 42 | 4,421 to 4,086 | 969 to 517 | 266 to 268 | 1,037 to 1,098 |
 
Weighting lowered missed attacks in all four seeds at both cutoffs (about 330 fewer on average at 0.5 and about 309 fewer at 0.05) for a few more false alarms. The size of the gain varies a lot by seed, so I quote it as roughly 300. Only four seeds and two cutoffs were tested.
 
### Other findings
 
- **Run-to-run noise:** different random seeds move missed attacks by about 130 at cutoff 0.5 and about 245 at cutoff 0.05; false alarms move by at most about 19. Differences smaller than this are not interpreted.
- **Duplicates:** removing the 5,843 duplicate training rows made no clear difference.
- **Feature importance** (Random Forest, one-hot columns summed): the top features are `src_bytes` (0.133), `flag` (0.119), `service` (0.107), `dst_bytes` (0.103), then several same-service and error-rate features. Importance by split frequency shows what the model uses, not what matters in real traffic.
## Limitations
 
- NSL-KDD derives from 1999 traffic, so this says little about modern networks.
- The Kaggle copy has fewer features than the original.
- Cutoff comparisons are made on the test set; the validation approach failed to predict false alarms.
- Results come from a small number of random seeds.
- Attack types still missed at a low cutoff (`mailbomb`, `snmpgetattack`) are not addressed.
## How to run
 
```bash
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux / macOS
python -m pip install -r requirements.txt
```
 
Put `KDDTrain.parquet` and `KDDTest.parquet` in `data/`, then open `notebooks/01_baseline.ipynb` and run all cells. Developed with Python 3.15 in a virtual environment.
 
## Repo structure
 
```
spiral/
├── data/            # not tracked; download from Kaggle
├── notebooks/
│   └── 01_baseline.ipynb
├── requirements.txt
└── README.md
```
 
## Next steps
 
- SHAP explanations for individual alerts
- A multi-class model that predicts the attack type
- Anomaly detection trained on normal traffic only, aimed at unseen attacks
- A Streamlit dashboard
- A second dataset (CIC-IDS2017) to test generalization
## Credits
 
NSL-KDD: M. Tavallaee, E. Bagheri, W. Lu and A. Ghorbani, "A detailed analysis of the KDD CUP 99 data set", 2009. Data copy on Kaggle by the user `dhoogla`.

License: MIT
 
*Author: Shlok*
 
