// Research-only XSMB: 200,704,000 position/triangle bridge formulas, 500 past-only targets each.
// No production imports, edits, Telegram calls, or main/client URL changes.
#include <bits/stdc++.h>
using namespace std;
struct Day{string date;array<uint8_t,280> dig{};array<uint8_t,100> hit{};};
struct Rule{uint32_t id=0;int train=0,score=0;array<int,5> blocks{};};
struct Stat{int win=0,ge2=0,ge3=0,nhay=0,repeats=0,fallback=0;array<int,5> blocks{};array<int,7> hist{};};
vector<Day> days; uint8_t lut[160][100];
const int len[27]={5,5,5,5,5,5,5,5,5,5,4,4,4,4,4,4,4,4,4,4,3,3,3,2,2,2,2};
const int lagA[16]={1,1,1,1,1,2,2,2,2,2,3,3,3,3,5,7};
const int lagB[16]={1,2,3,5,7,1,2,3,5,7,1,2,3,5,3,5};
constexpr uint32_t AREA=280u*280u*160u, RULES=AREA*16u;
vector<string> split(const string&s,char sep){vector<string> v;string p;stringstream ss(s);while(getline(ss,p,sep))v.push_back(p);return v;}
void load(const string &file){
 ifstream in(file);if(!in)throw runtime_error("CSV could not be opened");string s;getline(in,s);
 vector<pair<string,vector<string>>> rows;
 while(getline(in,s)){auto v=split(s,',');if(v.size()!=28)continue;if(v[0]<"2021-01-01"||v[0]>"2026-10-10")continue;
 rows.push_back({v[0],{v.begin()+1,v.end()}});}
 sort(rows.begin(),rows.end(),[](auto&a,auto&b){return a.first<b.first;});
 if(rows.size()<2000)throw runtime_error("Fewer than 2,000 dated full draws");
 rows.erase(rows.begin(),rows.end()-2000);
 if(rows.back().first!="2026-10-10"||rows.back().second[0]!="82153")throw runtime_error("Latest actual draw does not match source authority");
 for(auto &r:rows){Day d;d.date=r.first;int p=0;
 for(int g=0;g<27;g++){string str=r.second[g];if(str.empty()||str.size()>size_t(len[g])||str.find_first_not_of("0123456789")!=string::npos)throw runtime_error("Bad prize digits: "+d.date);
 str=string(len[g]-str.size(),'0')+str;
 int number=(str[str.size()-2]-'0')*10+(str.back()-'0');d.hit[number]++;
 vector<uint8_t> x;for(char c:str)x.push_back(c-'0');
 for(int k=0;k<len[g];k++){for(auto digit:x)d.dig[p++]=digit;vector<uint8_t> y;for(int j=0;j+1<int(x.size());j++)y.push_back((x[j]+x[j+1])%10);x=move(y);}
 }
 if(p!=280)throw runtime_error("Triangular geometry must produce 280 digits");days.push_back(move(d));}
}
int form(int a,int b,int m){int x,y;switch(m){
case 0:x=a;y=b;break;case 1:x=b;y=a;break;case 2:x=(a+b)%10;y=(a+2*b)%10;break;
case 3:x=(a-b+10)%10;y=(2*a+b)%10;break;case 4:x=(3*a+b)%10;y=(a+3*b)%10;break;
case 5:x=(2*a+b)%10;y=(a+5*b)%10;break;case 6:x=(a+b)%10;y=(a-b+10)%10;break;
case 7:x=a*b%10;y=(a+b)%10;break;case 8:x=a*b%10;y=(a-b+10)%10;break;
case 9:x=(a*a+b)%10;y=(a+b*b)%10;break;case 10:x=(4*a+b)%10;y=(a+7*b)%10;break;
case 11:x=(a+6*b)%10;y=(3*a+b)%10;break;case 12:x=(a+3*b)%10;y=(8*a+b)%10;break;
case 13:x=(9*a+b)%10;y=(a+9*b)%10;break;case 14:x=(7*a+3*b)%10;y=(a+4*b)%10;break;
default:x=(5*a+b)%10;y=(a+5*b)%10;}return 10*x+y;}
void init(){for(int m=0;m<160;m++)for(int a=0;a<10;a++)for(int b=0;b<10;b++){int z=form(a,b,m%16);
lut[m][10*a+b]=uint8_t(10*((z/10+m/16)%10)+z%10);}}
inline uint8_t predict(uint32_t id,int t){int g=id/AREA,r=id%AREA,m=r%160,p=r/160,i=p/280,j=p%280;
return lut[m][10*days[t-lagA[g]].dig[i]+days[t-lagB[g]].dig[j]];}
inline bool legal(int t,int n){return !(days[t-1].hit[n]&&days[t-2].hit[n]);}
inline bool success(uint32_t id,int t){int n=predict(id,t);return legal(t,n)&&days[t].hit[n];}
int score(const Rule&r){return 6*(*min_element(r.blocks.begin(),r.blocks.end()))+r.train/2+(r.blocks[3]+r.blocks[4])/4;}
void insert(vector<Rule>&v,const Rule&r,size_t cap){
if(v.size()>=cap&&r.score<=v.back().score)return;
auto it=lower_bound(v.begin(),v.end(),r,[](auto&a,auto&b){return a.score>b.score;});
v.insert(it,r);if(v.size()>cap)v.resize(cap);
}
vector<Rule> hunt(int nthreads){
vector<vector<Rule>> pools(nthreads);vector<thread> th;
for(int worker=0;worker<nthreads;worker++)th.emplace_back([&,worker]{
uint64_t begin=uint64_t(RULES)*worker/nthreads,end=uint64_t(RULES)*(worker+1)/nthreads;
auto &top=pools[worker];top.reserve(241);
for(uint64_t id=begin;id<end;id++){
uint32_t group=id/AREA,rest=id%AREA;int m=rest%160,pos=rest/160,i=pos/280,j=pos%280,la=lagA[group],lb=lagB[group];const uint8_t *table=lut[m];
Rule q;q.id=uint32_t(id);
for(int t=500;t<1000;t++){int n=table[10*days[t-la].dig[i]+days[t-lb].dig[j]];
if(days[t-1].hit[n]&&days[t-2].hit[n])continue;
if(days[t].hit[n]){q.train++;q.blocks[(t-500)/100]++;}}
q.score=score(q);insert(top,q,240);
if((id-begin)%20000000==0&&id>begin)cerr<<"PROGRESS worker="<<worker<<" completed="<<(id-begin)<<"\n";
}});
for(auto&t:th)t.join();
vector<Rule> out;for(auto&p:pools)out.insert(out.end(),p.begin(),p.end());
sort(out.begin(),out.end(),[](auto&a,auto&b){return a.score>b.score;});if(out.size()>256)out.resize(256);return out;
}
array<int,5> block(uint32_t id,int from){array<int,5> z{};for(int t=from;t<from+500;t++)z[(t-from)/100]+=success(id,t);return z;}
vector<array<uint8_t,10>> fallback;
void initFallback(){fallback.resize(days.size());for(int t=500;t<int(days.size());t++){
array<int,100> score{};for(int lag=1;lag<=30;lag++)for(int n=0;n<100;n++)score[n]+=days[t-lag].hit[n];
vector<int> good;for(int n=0;n<100;n++)if(legal(t,n))good.push_back(n);
sort(good.begin(),good.end(),[&](int a,int b){return score[a]!=score[b]?score[a]>score[b]:a<b;});
for(int j=0;j<10;j++)fallback[t][j]=good[j];
}}
array<int,3> pick(const array<uint32_t,3>&ids,int t,int&replaced){
array<int,3> p{};for(int k=0;k<3;k++){
int n=predict(ids[k],t);bool duplicate=false;for(int j=0;j<k;j++)duplicate|=p[j]==n;
if(!legal(t,n)||duplicate){replaced++;for(int j=0;j<10;j++){n=fallback[t][j];duplicate=false;for(int l=0;l<k;l++)duplicate|=p[l]==n;if(!duplicate)break;}}
p[k]=n;}return p;}
Stat assess(const array<uint32_t,3>&ids,int from){
Stat o;string last;for(int t=from;t<from+500;t++){int substitutions=0;auto p=pick(ids,t,substitutions);o.fallback+=substitutions;
int count=0;for(int n:p)count+=days[t].hit[n];
o.win+=count>0;o.ge2+=count>=2;o.ge3+=count>=3;o.nhay+=count;o.hist[min(count,6)]++;o.blocks[(t-from)/100]+=count>0;
sort(p.begin(),p.end());string key=to_string(p[0])+","+to_string(p[1])+","+to_string(p[2]);o.repeats+=key==last;last=move(key);}return o;}
struct Trio{array<uint32_t,3> id{};Stat train;int score=0;};
int tripleScore(const Stat&x){return 5*(*min_element(x.blocks.begin(),x.blocks.end()))+x.win+x.ge2/6-x.repeats/2-x.fallback/40;}
vector<Trio> ensemble(const vector<Rule>&rules){
vector<Trio> best;int n=min(64,int(rules.size()));
for(int a=0;a<n;a++)for(int b=a+1;b<n;b++)for(int c=b+1;c<n;c++){
Trio t;t.id={rules[a].id,rules[b].id,rules[c].id};t.train=assess(t.id,500);t.score=tripleScore(t.train);
if(best.size()<100||t.score>best.back().score){
auto it=lower_bound(best.begin(),best.end(),t,[](auto&a,auto&b){return a.score>b.score;});
best.insert(it,t);if(best.size()>100)best.resize(100);}}
return best;}
template <size_t N>void arr(const array<int,N>&a){cout<<"[";for(int i=0;i<int(N);i++){if(i)cout<<",";cout<<a[i];}cout<<"]";}
void stat(const Stat&s){cout<<"{\"days\":500,\"ge1\":"<<s.win<<",\"ge2\":"<<s.ge2<<",\"ge3\":"<<s.ge3<<",\"nhay\":"<<s.nhay<<",\"repeated_three_sets\":"<<s.repeats<<",\"fallback_picks\":"<<s.fallback<<",\"per100\":";arr(s.blocks);cout<<",\"nhay_hist_0_1_2_3_4_5_ge6\":";arr(s.hist);cout<<"}";}
int main(int argc,char**argv){try{
if(argc<2)throw runtime_error("Need full xsmb.csv");int threads=argc>2?stoi(argv[2]):4;threads=max(1,min(8,threads));
load(argv[1]);init();initFallback();auto begin=chrono::steady_clock::now();
auto top=hunt(threads);if(top.empty())throw runtime_error("No candidate bridges");
vector<pair<int,int>> ranked;for(int i=0;i<int(top.size());i++){auto x=block(top[i].id,1000);ranked.push_back({accumulate(x.begin(),x.end(),0),i});}
sort(ranked.begin(),ranked.end(),greater<>());auto single=top[ranked[0].second];
auto sets=ensemble(top);auto selected=sets.front();auto mid=assess(selected.id,1000);
for(int i=1;i<int(sets.size());i++){auto next=assess(sets[i].id,1000);
if(next.win>mid.win||(next.win==mid.win&&next.ge2>mid.ge2)){mid=next;selected=sets[i];}}
auto final=assess(selected.id,1500);
auto sec=chrono::duration<double>(chrono::steady_clock::now()-begin).count();
cout<<"{\"experiment\":\"XSMB_RESEARCH_ONLY_100B\",\"source_dates\":[\""<<days.front().date<<"\",\""<<days.back().date<<"\"]";
cout<<",\"formula_count\":"<<RULES<<",\"rule_day_evaluations\":"<<uint64_t(RULES)*500<<",\"compute_seconds\":"<<sec;
cout<<",\"train_period\":[\""<<days[500].date<<"\",\""<<days[999].date<<"\"],\"validation_period\":[\""<<days[1000].date<<"\",\""<<days[1499].date<<"\"],\"holdout_period\":[\""<<days[1500].date<<"\",\""<<days[1999].date<<"\"]";
cout<<",\"top_single_in_training\":{\"id\":"<<top[0].id<<",\"train_days\":"<<top[0].train<<",\"train_per100\":";arr(top[0].blocks);cout<<",\"validation_per100\":";arr(block(top[0].id,1000));cout<<"}";
cout<<",\"single_selected_by_validation\":{\"id\":"<<single.id<<",\"train_days\":"<<single.train<<",\"validation_per100\":";arr(block(single.id,1000));cout<<",\"holdout_per100\":";arr(block(single.id,1500));cout<<"}";
cout<<",\"three_formula_ids\":["<<selected.id[0]<<","<<selected.id[1]<<","<<selected.id[2]<<"],\"three_train\":";stat(selected.train);
cout<<",\"three_validation\":";stat(mid);cout<<",\"three_holdout\":";stat(final);
cout<<",\"accepted_350_out_of_500\":"<<(final.win>=350?"true":"false")<<",\"production_modified\":false}\n";
}catch(exception&e){cerr<<"ERROR "<<e.what()<<'\n';return 1;}}
