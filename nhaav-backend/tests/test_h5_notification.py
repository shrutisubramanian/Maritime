# pyrefly: ignore [missing-import]
"""H5 - Notification Delivery Tests"""
import uuid, pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database import Base, get_db
from app.models.user import User, UserRole
from app.models.profile import Profile, VerificationStatus
from app.models.service import Service
from app.models.request import ServiceRequest, RequestStatus
from app.models.notification import Notification, NotificationType
from app.services.quote_service import QuoteService
from app.services.job_service import JobService
from app.services.review_service import ReviewService
from app.schemas.quote import QuoteCreate
from app.schemas.review import ReviewCreate

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_h5_notif.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try: yield db
    finally: db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.pop(get_db, None)

@pytest.fixture(scope="module")
def db():
    s = TestingSessionLocal(); yield s; s.close()

def _cu(db, email, role="client"):
    u = User(email=email, password_hash="h", role=role, full_name="Test")
    db.add(u); db.commit(); db.refresh(u); return u

def _pu(db, email):
    u = _cu(db, email, UserRole.provider)
    p = Profile(user_id=u.id, company_name="Co "+email, verification_status=VerificationStatus.verified)
    db.add(p); db.commit()
    s = Service(provider_id=u.id, service_id="Hydraulic Repairs", port_id="Mumbai Port", name="Hydraulic Repairs", category="RM", is_active=True)
    db.add(s); db.commit()
    return u

def _rq(db, cu, title="T"):
    r = ServiceRequest(client_id=cu.id, title=title, service_type="Hydraulic Repairs", port="Mumbai Port", description="D", request_type="service", status=RequestStatus.open)
    db.add(r); db.commit(); db.refresh(r); return r

def _qt(db, pu, r, reset_status=True):
    if reset_status:
        r.status = RequestStatus.open
        db.commit()
    d = QuoteCreate(amount=5000, currency="USD", description="Q", delivery_time="5d")
    return QuoteService.create_quote(db=db, provider_id=pu.id, request_id=r.id, quote_data=d)

class TestCreateQuoteNotification:
    def test_client_notified(self, db):
        cu = _cu(db, "c_q_h5@t.com"); pu = _pu(db, "p_q_h5@t.com")
        r = _rq(db, cu); _qt(db, pu, r)
        n = db.query(Notification).filter(Notification.user_id==cu.id, Notification.type==NotificationType.quote).all()
        assert len(n)>=1 and any("New Quote Received" in x.title for x in n)

class TestAcceptQuoteNotification:
    def test_accepted_notified(self, db):
        cu = _cu(db, "c_a_h5@t.com")
        pa = _pu(db, "pa_a_h5@t.com"); pb = _pu(db, "pb_a_h5@t.com")
        r = _rq(db, cu, "A"); qa = _qt(db, pa, r); _qt(db, pb, r)
        db.query(Notification).delete(); db.commit()
        QuoteService.accept_quote(db, qa.id, cu.id)
        na = db.query(Notification).filter(Notification.user_id==pa.id, Notification.title=="Quote Accepted!").all()
        assert len(na)>=1

    def test_rejected_notified(self, db):
        cu = _cu(db, "c_r_h5@t.com")
        pa = _pu(db, "pa_r_h5@t.com"); pb = _pu(db, "pb_r_h5@t.com")
        r = _rq(db, cu, "R"); qa = _qt(db, pa, r); _qt(db, pb, r)
        db.query(Notification).delete(); db.commit()
        QuoteService.accept_quote(db, qa.id, cu.id)
        nb = db.query(Notification).filter(Notification.user_id==pb.id, Notification.title=="Quote Rejected").all()
        assert len(nb)>=1

class TestRejectQuoteNotification:
    def test_rejected_notified(self, db):
        cu = _cu(db, "c_rj_h5@t.com"); pu = _pu(db, "p_rj_h5@t.com")
        r = _rq(db, cu, "RJ"); q = _qt(db, pu, r)
        db.query(Notification).delete(); db.commit()
        QuoteService.reject_quote(db, q.id, cu.id)
        n = db.query(Notification).filter(Notification.user_id==pu.id, Notification.title=="Quote Rejected").all()
        assert len(n)>=1

class TestCompleteJobNotification:
    def _setup(self, db):
        c=uuid.uuid4().hex[:6]; p=uuid.uuid4().hex[:6]
        cu=_cu(db,"cc_"+c+"@t.com"); pu=_pu(db,"pc_"+p+"@t.com")
        r=_rq(db,cu,"C"+c); q=_qt(db,pu,r)
        QuoteService.accept_quote(db,q.id,cu.id)
        jobs=JobService.get_all_jobs_for_user(db,cu.id); assert len(jobs)>=1
        return cu,pu,jobs[0]
    def test_client_notified(self, db):
        cu,pu,j=self._setup(db)
        db.query(Notification).delete(); db.commit()
        JobService.complete_job(db,j.id,pu.id)
        n=db.query(Notification).filter(Notification.user_id==cu.id,Notification.title=="Job Completed").all()
        assert len(n)>=1
    def test_provider_notified(self, db):
        cu,pu,j=self._setup(db)
        db.query(Notification).delete(); db.commit()
        JobService.complete_job(db,j.id,cu.id)
        n=db.query(Notification).filter(Notification.user_id==pu.id,Notification.title=="Job Completed").all()
        assert len(n)>=1

class TestCancelJobNotification:
    def _setup(self, db):
        c=uuid.uuid4().hex[:6]; p=uuid.uuid4().hex[:6]
        cu=_cu(db,"ccl_"+c+"@t.com"); pu=_pu(db,"pcl_"+p+"@t.com")
        r=_rq(db,cu,"X"+c); q=_qt(db,pu,r)
        QuoteService.accept_quote(db,q.id,cu.id)
        jobs=JobService.get_all_jobs_for_user(db,cu.id); assert len(jobs)>=1
        return cu,pu,jobs[0]
    def test_client_notified(self, db):
        cu,pu,j=self._setup(db)
        db.query(Notification).delete(); db.commit()
        JobService.cancel_job(db,j.id,pu.id)
        n=db.query(Notification).filter(Notification.user_id==cu.id,Notification.title=="Job Cancelled").all()
        assert len(n)>=1
    def test_provider_notified(self, db):
        cu,pu,j=self._setup(db)
        db.query(Notification).delete(); db.commit()
        JobService.cancel_job(db,j.id,cu.id)
        n=db.query(Notification).filter(Notification.user_id==pu.id,Notification.title=="Job Cancelled").all()
        assert len(n)>=1

class TestCreateReviewNotification:
    def _setup(self, db):
        c=uuid.uuid4().hex[:6]; p=uuid.uuid4().hex[:6]
        cu=_cu(db,"crv_"+c+"@t.com"); pu=_pu(db,"prv_"+p+"@t.com")
        r=_rq(db,cu,"V"+c); q=_qt(db,pu,r)
        QuoteService.accept_quote(db,q.id,cu.id)
        jobs=JobService.get_all_jobs_for_user(db,cu.id); assert len(jobs)>=1
        JobService.complete_job(db,jobs[0].id,pu.id)
        return cu,pu,jobs[0]
    def test_provider_notified(self, db):
        cu,pu,j=self._setup(db)
        db.query(Notification).delete(); db.commit()
        rd=ReviewCreate(job_id=j.id,rating=5,comment="Great!")
        ReviewService.create_review(db,rd,cu.id)
        n=db.query(Notification).filter(Notification.user_id==pu.id,Notification.title=="New Review Received").all()
        assert len(n)>=1 and "5-star" in n[0].message
