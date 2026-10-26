// 총 스킨 (설계 27장): 치비 손에 맞춘 크기. 오른쪽을 향하고 손잡이는 왼쪽 아래, 렌더러는 (2, 높이/2) 를 손 축으로 쓴다.
// 체임버 전용 헤드헌터·역작은 art/chamber.js 에 있다.
export const GUN_ART = {
  // 클래식: 짧은 권총, 위 슬라이드는 밝은 회색, 몸통은 짙은 회색.
  gun_classic: [
    '..kkkkkkkkkkkk.',
    '.klllwllllllllk',
    '.kmmmmmmmmmmmkk',
    '.kMMMMMMMMkMMk.',
    '.kMMMMkkkkkkk..',
    'kMMMkMk........',
    'kNMMkk.........',
    'kMMMk..........',
    '.kkk...........',
  ],
  // 셰리프: 리볼버, 긴 총신과 탄창 실린더, 금빛 손잡이.
  gun_sheriff: [
    '.....kkkkkkkkkkkkMk',
    '....kllllllllllllMk',
    '...kMMMMMmmmmmmmmmk',
    '..kkMlMlMMMMMMkkkk.',
    '.kggMMlMMkkkkk.....',
    '.kggMMkkk..........',
    'kgggkk.............',
    'kgGgk..............',
    'kGggk..............',
    '.kkk...............',
  ],
  // 스펙터: 소음기 달린 기관단총, 앞으로 길게 뻗은 소음기와 짧은 탄창.
  gun_spectre: [
    '.....kkkkkkkk.........',
    'kkkkkllllllllkkkkkkkk.',
    'MMMmmmmmmmmmmmNNNNNNvk',
    'NNNMMMMMMMMMMMNNNNNNNk',
    'kkMMkkkkNNkkkkkkkkkkk.',
    '.kMMk..kNNk...........',
    '.kMMk..kNNk...........',
    '.kMMk..kNNk...........',
    '..kk...kNNk...........',
    '........kk............',
  ],
  // 밴달: 굽은 탄창과 개머리판이 있는 돌격소총, 짙은 몸통에 밝은 줄.
  gun_vandal: [
    '........kkkkkkkkkkk.....k.',
    'kkkkkkkklllllllllllkkkkkMk',
    'MMMMMMmmmmmmmmmmmmmmmmMMMk',
    'MMMMMMMMMMMMMMMMMMMMMMkkk.',
    'NNNNNNNNkkkNvNkkMMMMMk....',
    'kkkkkkNNk.kNNNk.kkkkk.....',
    '.....kNNk..kNNNk..........',
    '......kk...kNNNk..........',
    '............kNNNk.........',
    '.............kkk..........',
    '..........................',
  ],
  // 저지: 굵은 자동 산탄총, 주황 탄창 상자, 짧고 두꺼운 총신.
  gun_judge: [
    '......kkkkkkkkkkkkk.....',
    'kkkkkklllllllllllllkkk..',
    'MMMMmmmmmmmmmmmmmmmmmmk.',
    'MMMMMMMMMMMMMMMMMMMMMMk.',
    'NNNNMMMMMMMMMMMMMMMMMkk.',
    'kkkkNNkkkooooONNNNNNkk..',
    '...kNNk.kooooOkkkkkk....',
    '...kNNk.kooooOk.........',
    '....kk..kooooOk.........',
    '.........kkkkk..........',
    '........................',
  ],
  // 오퍼레이터: 긴 저격총, 위에 큰 조준경(청록 렌즈), 개머리판.
  gun_operator: [
    '..........kkvvvvvvvkk...............',
    '.........ktNNNNNNNNNtk..............',
    '........kkNNNNNNNNNNTkkkkkkkkkk..k..',
    'kkkkkkkklllllllllllllllllllllllkkMk.',
    'NNNNNmmmmmmmmmmmmmmmmmmmmmmmmmmmmmk.',
    'NNNNNMMMMMMMMMMMMMMMMMMMMMMMMMMMMMk.',
    'NNNNNkMMkkNNNNkkkkkkkkkkkkNNNNNkkk..',
    'NNkkkkMMk.kNNNk...........kkkkk.....',
    'kk...kMMk..kkk......................',
    '......kk............................',
    '....................................',
  ],
};
